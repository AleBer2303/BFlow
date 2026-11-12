import Foundation

// MARK: - Sincronización remota (Firestore REST)
//
// Cambios hechos desde otro dispositivo (p. ej. la web) llegan al widget sin abrir la app:
// cualquier plataforma escribe `users/{uid}/widgetSnapshots/current` con
// `payload` = JSON WidgetSnapshotV2. En cada timeline el widget:
//   1. obtiene un ID token (caché en memoria/archivo o refresh contra securetoken),
//   2. lee el documento con la API REST de Firestore,
//   3. se queda con el más reciente entre local y remoto (por fecha real) y, si gana el
//      remoto, lo guarda en el App Group.
// Presupuesto total de red: 8 s. Ante cualquier error se usa el snapshot local.

actor WidgetRemoteSync {
    static let shared = WidgetRemoteSync()

    /// Las cinco familias piden timeline casi a la vez: una sola consulta las sirve a todas.
    private static let coalescingWindow: TimeInterval = 30
    private static let networkBudget: TimeInterval = 8
    /// Margen antes de `expires_in` para no usar un token a punto de caducar.
    private static let tokenSafetyMargin: TimeInterval = 60

    private var inFlight: Task<WidgetSnapshotV2?, Never>?
    private var lastCheck: Date?
    private var lastResult: WidgetSnapshotV2?
    /// Cuenta a la que pertenece `lastResult`: un cambio de cuenta invalida la ventana.
    private var lastUid: String?
    private var memoryToken: WidgetTokenCacheV1?

    private let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = WidgetRemoteSync.networkBudget
        configuration.timeoutIntervalForResource = WidgetRemoteSync.networkBudget
        configuration.waitsForConnectivity = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.urlCache = nil
        return URLSession(configuration: configuration)
    }()

    /// El botón "Actualizar" olvida la última consulta para que la siguiente vaya a la red.
    func invalidateRecentCheck() {
        lastCheck = nil
        lastResult = nil
        lastUid = nil
    }

    /// El botón "Actualizar" también borra la marca de rechazo: el usuario pide reintentar.
    /// Se elimina el archivo de caché solo si está marcado; un ID token válido se conserva.
    func clearRejection() {
        if memoryToken?.rejected == true {
            memoryToken = nil
        }
        if let cache = WidgetSharedStorage.loadTokenCache(), cache.rejected {
            WidgetSharedStorage.clearTokenCache()
        }
    }

    /// Snapshot remoto (ya persistido si era más nuevo que el local) o nil.
    func latestRemoteSnapshot() async -> WidgetSnapshotV2? {
        if let inFlight {
            return await inFlight.value
        }
        let currentUid = WidgetSharedStorage.loadAuth()?.uid
        if let lastCheck, lastUid == currentUid,
           Date().timeIntervalSince(lastCheck) < Self.coalescingWindow {
            return lastResult
        }
        let task = Task { await self.performSync() }
        inFlight = task
        let result = await task.value
        inFlight = nil
        lastCheck = Date()
        lastResult = result
        lastUid = currentUid
        return result
    }

    // MARK: Flujo principal

    private func performSync() async -> WidgetSnapshotV2? {
        guard let auth = WidgetSharedStorage.loadAuth() else {
            // Sesión cerrada: sin credenciales no queda nada que cachear.
            memoryToken = nil
            WidgetSharedStorage.clearTokenCache()
            return nil
        }
        let deadline = Date().addingTimeInterval(Self.networkBudget)
        do {
            guard let idToken = try await validIdToken(for: auth, deadline: deadline) else {
                return nil
            }
            guard let remote = try await fetchRemoteDocument(auth: auth, idToken: idToken, deadline: deadline) else {
                return nil
            }
            persistIfNewer(remote, for: auth)
            return remote.snapshot
        } catch {
            return nil
        }
    }

    /// Guarda el remoto solo si sigue siendo la misma sesión (la app pudo cerrar sesión mientras
    /// el widget consultaba) y si es más reciente que lo que ya hay en el App Group.
    private func persistIfNewer(_ remote: RemoteSnapshot, for auth: WidgetAuthV1) {
        guard let currentAuth = WidgetSharedStorage.loadAuth(), currentAuth.uid == auth.uid else {
            return
        }
        let local = WidgetSharedStorage.loadSnapshot()
        if let local, local.updatedAt >= remote.snapshot.updatedAt {
            return
        }
        WidgetSharedStorage.saveSnapshotPayload(remote.payload)
    }

    // MARK: ID token

    private func validIdToken(for auth: WidgetAuthV1, deadline: Date) async throws -> String? {
        let fingerprint = WidgetSharedStorage.fingerprint(of: auth.refreshToken)
        let now = Date()

        if let token = memoryToken?.isUsable(for: auth, fingerprint: fingerprint, now: now) {
            return token
        }
        if let cache = WidgetSharedStorage.loadTokenCache() {
            if cache.isRejected(for: auth, fingerprint: fingerprint) {
                // Token revocado: no reintentar en bucle; la app escribirá credenciales nuevas.
                return nil
            }
            if let token = cache.isUsable(for: auth, fingerprint: fingerprint, now: now) {
                memoryToken = cache
                return token
            }
        }
        return try await refreshIdToken(for: auth, deadline: deadline)
    }

    private func refreshIdToken(for auth: WidgetAuthV1, deadline: Date) async throws -> String? {
        guard let url = URL(string: "https://securetoken.googleapis.com/v1/token?key=\(Self.queryEscape(auth.apiKey))") else {
            return nil
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = try Self.remainingTime(until: deadline)
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue(WidgetSharedStorage.mainAppBundleIdentifier(), forHTTPHeaderField: "X-Ios-Bundle-Identifier")
        let body = "grant_type=refresh_token&refresh_token=\(Self.formEscape(auth.refreshToken))"
        request.httpBody = Data(body.utf8)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { return nil }

        switch http.statusCode {
        case 200:
            break
        case 400, 401, 403:
            // Solo un rechazo definitivo de la sesión marca `rejected`; cualquier otro 4xx
            // (API key restringida, cuota, petición mal formada) es transitorio: sin marca.
            if Self.isDefinitiveRefreshFailure(data) {
                markRejected(auth)
            }
            return nil
        default:
            return nil
        }

        let token = try JSONDecoder().decode(SecureTokenResponse.self, from: data)
        guard !token.idToken.isEmpty else { return nil }
        if let userId = token.userId, !userId.isEmpty, userId != auth.uid {
            // Respuesta de otra cuenta: no mezclar datos.
            return nil
        }

        var activeAuth = auth
        if let rotated = token.refreshToken, !rotated.isEmpty, rotated != auth.refreshToken {
            activeAuth = auth.replacingRefreshToken(rotated)
            // Solo si la app no cerró sesión ni cambió de cuenta mientras tanto.
            if let currentAuth = WidgetSharedStorage.loadAuth(),
               currentAuth.uid == auth.uid, currentAuth.refreshToken == auth.refreshToken {
                WidgetSharedStorage.saveAuth(activeAuth)
            }
        }

        let lifetime = max(0, TimeInterval(token.expiresIn ?? 3600) - Self.tokenSafetyMargin)
        let cache = WidgetTokenCacheV1(
            uid: activeAuth.uid,
            refreshFingerprint: WidgetSharedStorage.fingerprint(of: activeAuth.refreshToken),
            idToken: token.idToken,
            expiresAtEpoch: Date().addingTimeInterval(lifetime).timeIntervalSince1970,
            rejected: false
        )
        memoryToken = cache
        WidgetSharedStorage.saveTokenCache(cache)
        return token.idToken
    }

    private func markRejected(_ auth: WidgetAuthV1) {
        let cache = WidgetTokenCacheV1(
            uid: auth.uid,
            refreshFingerprint: WidgetSharedStorage.fingerprint(of: auth.refreshToken),
            idToken: nil,
            expiresAtEpoch: nil,
            rejected: true
        )
        memoryToken = nil
        WidgetSharedStorage.saveTokenCache(cache)
    }

    private func dropCachedIdToken() {
        memoryToken = nil
        WidgetSharedStorage.clearTokenCache()
    }

    // MARK: Documento de Firestore

    private func fetchRemoteDocument(auth: WidgetAuthV1, idToken: String, deadline: Date) async throws -> RemoteSnapshot? {
        let project = Self.pathEscape(auth.projectId)
        let uid = Self.pathEscape(auth.uid)
        let urlString = "https://firestore.googleapis.com/v1/projects/\(project)/databases/(default)/documents/users/\(uid)/widgetSnapshots/current"
        guard let url = URL(string: urlString) else { return nil }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = try Self.remainingTime(until: deadline)
        request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { return nil }

        switch http.statusCode {
        case 200:
            break
        case 401, 403:
            // ID token caducado antes de tiempo o reglas que lo rechazan: refrescar la próxima vez.
            dropCachedIdToken()
            return nil
        default:
            // 404 = aún no hay documento remoto; cualquier otro código: usar el local.
            return nil
        }

        let document = try JSONDecoder().decode(FirestoreDocument.self, from: data)
        if let version = document.fields?.schemaVersion?.integerValue,
           Int(version) != WidgetSnapshotV2.supportedSchemaVersion {
            return nil
        }
        guard let payload = document.fields?.payload?.stringValue else { return nil }
        let payloadData = Data(payload.utf8)
        guard let snapshot = WidgetSnapshotV2.decode(from: payloadData) else { return nil }
        return RemoteSnapshot(snapshot: snapshot, payload: payloadData)
    }

    // MARK: Utilidades

    /// Errores de securetoken que invalidan la sesión para siempre. El cuerpo es
    /// `{"error":{"code":400,"message":"TOKEN_EXPIRED","status":"INVALID_ARGUMENT"}}`; a veces el
    /// mensaje trae detalle tras el código ("USER_DISABLED : …"), por eso se compara el prefijo.
    private static let definitiveRefreshErrors = [
        "TOKEN_EXPIRED",
        "INVALID_REFRESH_TOKEN",
        "USER_DISABLED",
        "USER_NOT_FOUND",
    ]

    private static func isDefinitiveRefreshFailure(_ data: Data) -> Bool {
        guard let body = try? JSONDecoder().decode(SecureTokenErrorResponse.self, from: data),
              let message = body.error?.message else {
            return false
        }
        let code = message.trimmingCharacters(in: .whitespaces)
        return definitiveRefreshErrors.contains { code == $0 || code.hasPrefix("\($0) ") || code.hasPrefix("\($0):") }
    }

    private static func remainingTime(until deadline: Date) throws -> TimeInterval {
        let remaining = deadline.timeIntervalSinceNow
        guard remaining > 0.5 else { throw URLError(.timedOut) }
        return remaining
    }

    /// Caracteres no reservados de RFC 3986: todo lo demás se codifica.
    private static let unreservedCharacters: CharacterSet = {
        var set = CharacterSet()
        set.insert(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        return set
    }()

    private static func formEscape(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: unreservedCharacters) ?? value
    }

    private static func queryEscape(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: unreservedCharacters) ?? value
    }

    private static func pathEscape(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: unreservedCharacters) ?? value
    }
}

// MARK: - Tipos de red

struct RemoteSnapshot: Sendable {
    let snapshot: WidgetSnapshotV2
    /// JSON tal cual llegó, para guardarlo sin re-serializar.
    let payload: Data
}

/// Respuesta de `securetoken.googleapis.com/v1/token`. `expires_in` llega como texto ("3600").
private struct SecureTokenResponse: Decodable {
    let idToken: String
    let refreshToken: String?
    let expiresIn: Int?
    let userId: String?

    private enum CodingKeys: String, CodingKey {
        case idToken = "id_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case userId = "user_id"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        idToken = try container.decode(String.self, forKey: .idToken)
        refreshToken = try container.decodeIfPresent(String.self, forKey: .refreshToken)
        userId = try container.decodeIfPresent(String.self, forKey: .userId)
        if let text = try? container.decodeIfPresent(String.self, forKey: .expiresIn) {
            expiresIn = Int(text)
        } else {
            expiresIn = try? container.decodeIfPresent(Int.self, forKey: .expiresIn)
        }
    }
}

/// Cuerpo de error de securetoken (solo interesa `error.message`).
private struct SecureTokenErrorResponse: Decodable {
    struct Body: Decodable {
        let message: String?
    }

    let error: Body?
}

/// Subconjunto del documento REST de Firestore que interesa al widget.
private struct FirestoreDocument: Decodable {
    struct StringValue: Decodable {
        let stringValue: String?
    }

    /// Firestore REST serializa los enteros como texto: `{"integerValue": "2"}`.
    struct IntegerValue: Decodable {
        let integerValue: String?
    }

    struct Fields: Decodable {
        let payload: StringValue?
        let schemaVersion: IntegerValue?
    }

    let fields: Fields?
}
