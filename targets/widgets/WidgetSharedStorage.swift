import CryptoKit
import Foundation

// MARK: - Almacenamiento compartido (App Group)
//
// La app escribe con `ExtensionStorage.setSecureFile(key, json, group)` (parche de
// `scripts/patch-extension-storage.mjs`): solo el archivo `<containerURL>/<key>.json` de cada
// App Group accesible, atómico, con protección `completeUntilFirstUserAuthentication` y
// excluido del backup. Nada va a UserDefaults: el refresh token no debe acabar en un plist
// ni en copias de seguridad, y un plist privado de la extensión (grupo sin contenedor) no lo
// podría borrar la app al cerrar sesión.
//
// Regla: solo se lee y escribe en grupos con `containerURL(...) != nil`.

public enum WidgetSharedStorage {
    public static let snapshotKey = "bflow_widget_snapshot_v2"
    public static let authKey = "bflow_widget_auth_v1"
    /// Caché del ID token y marca de rechazo. La app la borra con
    /// `remove('bflow_widget_id_token_v1', group)` al entregar credenciales y al cerrar sesión.
    static let tokenCacheKey = "bflow_widget_id_token_v1"

    // MARK: App Group

    /// Bundle id de la app principal: el de la extensión sin el sufijo final `.widgets`.
    /// Con `iloader` llega como `com.bflow.app.TEAM123.widgets` → `com.bflow.app.TEAM123`.
    public static func mainAppBundleIdentifier() -> String {
        let bundleId = Bundle.main.bundleIdentifier ?? "com.bflow.app.widgets"
        let suffix = ".widgets"
        if bundleId.hasSuffix(suffix) {
            return String(bundleId.dropLast(suffix.count))
        }
        return bundleId
    }

    /// `group.<bundle id principal>`, igual que `resolveDynamicAppGroupId` en TypeScript.
    public static func resolveAppGroupId() -> String {
        "group.\(mainAppBundleIdentifier())"
    }

    /// Grupos candidatos, por orden: dinámico, prefijo de tres componentes y el canónico.
    /// Cubre los sufijos de equipo que añade `iloader` al firmar.
    public static func candidateSuiteNames() -> [String] {
        var suites: [String] = [resolveAppGroupId()]
        let parts = mainAppBundleIdentifier().components(separatedBy: ".")
        if parts.count >= 3 {
            let prefixGroup = "group.\(parts.prefix(3).joined(separator: "."))"
            if !suites.contains(prefixGroup) {
                suites.append(prefixGroup)
            }
        }
        if !suites.contains("group.com.bflow.app") {
            suites.append("group.com.bflow.app")
        }
        return suites
    }

    /// Contenedores de los grupos a los que esta extensión tiene acceso real (sin duplicados).
    private static func accessibleContainers() -> [URL] {
        var urls: [URL] = []
        for suite in candidateSuiteNames() {
            guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: suite) else {
                continue
            }
            if !urls.contains(url) {
                urls.append(url)
            }
        }
        return urls
    }

    // MARK: Archivos

    private static func fileURL(in container: URL, key: String) -> URL {
        container.appendingPathComponent("\(key).json")
    }

    /// Todas las copias en archivo de `key` en los grupos accesibles.
    private static func storedPayloads(forKey key: String) -> [Data] {
        accessibleContainers().compactMap { container in
            guard let data = try? Data(contentsOf: fileURL(in: container, key: key)), !data.isEmpty else {
                return nil
            }
            return data
        }
    }

    /// Escritura atómica, protegida hasta el primer desbloqueo y excluida del backup
    /// (igual que `setSecureFile` en la app).
    private static func writeSecureFile(_ data: Data, forKey key: String) {
        for container in accessibleContainers() {
            var url = fileURL(in: container, key: key)
            do {
                try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                var values = URLResourceValues()
                values.isExcludedFromBackup = true
                try url.setResourceValues(values)
            } catch {
                continue
            }
        }
    }

    private static func removeFile(forKey key: String) {
        for container in accessibleContainers() {
            try? FileManager.default.removeItem(at: fileURL(in: container, key: key))
        }
    }

    // MARK: Snapshot

    /// El snapshot V2 más reciente entre las copias en archivo; nil si no hay ninguno válido
    /// (sesión no iniciada, primera vez o contrato viejo). Nunca inventa datos.
    public static func loadSnapshot() -> WidgetSnapshotV2? {
        storedPayloads(forKey: snapshotKey)
            .compactMap { WidgetSnapshotV2.decode(from: $0) }
            .reduce(nil as WidgetSnapshotV2?) { partial, next in WidgetSnapshotV2.newest(partial, next) }
    }

    /// Guarda un snapshot llegado de Firestore para la próxima lectura.
    static func saveSnapshotPayload(_ data: Data) {
        writeSecureFile(data, forKey: snapshotKey)
    }

    // MARK: Credenciales (solo archivo)

    public static func loadAuth() -> WidgetAuthV1? {
        for data in storedPayloads(forKey: authKey) {
            if let auth = try? JSONDecoder().decode(WidgetAuthV1.self, from: data), auth.isValid {
                return auth
            }
        }
        return nil
    }

    /// Reescribe las credenciales con un refresh token rotado por securetoken.
    static func saveAuth(_ auth: WidgetAuthV1) {
        guard let data = try? JSONEncoder().encode(auth) else { return }
        writeSecureFile(data, forKey: authKey)
    }

    // MARK: Caché del ID token y marca de rechazo

    static func loadTokenCache() -> WidgetTokenCacheV1? {
        for data in storedPayloads(forKey: tokenCacheKey) {
            if let cache = try? JSONDecoder().decode(WidgetTokenCacheV1.self, from: data) {
                return cache
            }
        }
        return nil
    }

    static func saveTokenCache(_ cache: WidgetTokenCacheV1) {
        guard let data = try? JSONEncoder().encode(cache) else { return }
        writeSecureFile(data, forKey: tokenCacheKey)
    }

    static func clearTokenCache() {
        removeFile(forKey: tokenCacheKey)
    }

    /// Huella estable (SHA-256) del refresh token: identifica la sesión sin guardarlo dos veces.
    static func fingerprint(of refreshToken: String) -> String {
        let digest = SHA256.hash(data: Data(refreshToken.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

/// ID token en caché ligado a una sesión concreta (uid + huella del refresh token).
/// `rejected` marca un refresh token rechazado de forma definitiva por securetoken
/// (TOKEN_EXPIRED, INVALID_REFRESH_TOKEN, USER_DISABLED, USER_NOT_FOUND): no se reintenta hasta
/// que la app borre este archivo (credenciales nuevas o cierre de sesión) o el usuario pulse
/// "Actualizar".
struct WidgetTokenCacheV1: Codable, Sendable {
    let uid: String
    let refreshFingerprint: String
    let idToken: String?
    let expiresAtEpoch: Double?
    let rejected: Bool

    func isUsable(for auth: WidgetAuthV1, fingerprint: String, now: Date) -> String? {
        guard !rejected, uid == auth.uid, refreshFingerprint == fingerprint,
              let token = idToken, !token.isEmpty,
              let expiresAt = expiresAtEpoch, now.timeIntervalSince1970 < expiresAt else {
            return nil
        }
        return token
    }

    func isRejected(for auth: WidgetAuthV1, fingerprint: String) -> Bool {
        rejected && uid == auth.uid && refreshFingerprint == fingerprint
    }
}
