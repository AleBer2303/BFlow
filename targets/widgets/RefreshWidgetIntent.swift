import AppIntents
import WidgetKit

/// Botón "Actualizar" de los widgets medianos y grandes (iOS 17+).
///
/// Corre en el proceso de la extensión. Borra la marca de rechazo de credenciales y olvida la
/// última consulta remota para que la siguiente vaya a Firestore; tras `perform()` WidgetKit
/// recarga el timeline por su cuenta.
struct RefreshWidgetIntent: AppIntent {
    static let title: LocalizedStringResource = "Actualizar BFlow"
    static let isDiscoverable: Bool = false

    init() {}

    func perform() async throws -> some IntentResult {
        await WidgetRemoteSync.shared.clearRejection()
        await WidgetRemoteSync.shared.invalidateRecentCheck()
        return .result()
    }
}
