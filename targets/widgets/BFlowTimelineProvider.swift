import Foundation
import WidgetKit

// MARK: - Entrada del timeline

struct BFlowEntry: TimelineEntry {
    let date: Date
    /// nil = sin datos (sesión no iniciada o primera vez): el widget muestra el estado vacío.
    let snapshot: WidgetSnapshotV2?
    /// true solo para `placeholder` y la galería sin datos: se pinta redactada.
    let isSample: Bool

    static func sample(date: Date = Date()) -> BFlowEntry {
        BFlowEntry(date: date, snapshot: .placeholderSample, isSample: true)
    }

    static func empty(date: Date = Date()) -> BFlowEntry {
        BFlowEntry(date: date, snapshot: nil, isSample: false)
    }
}

// MARK: - Proveedor compartido por los cinco widgets

struct BFlowTimelineProvider: TimelineProvider {
    /// Cadencia de respaldo: WidgetKit decide el momento exacto según su presupuesto.
    static let refreshInterval: TimeInterval = 15 * 60

    func placeholder(in context: Context) -> BFlowEntry {
        .sample()
    }

    /// Galería y transiciones rápidas: solo lectura local, sin red.
    /// Sin credenciales no hay sesión: estado vacío aunque quede un snapshot local.
    func getSnapshot(in context: Context, completion: @escaping (BFlowEntry) -> Void) {
        if WidgetSharedStorage.loadAuth() != nil, let local = WidgetSharedStorage.loadSnapshot() {
            completion(BFlowEntry(date: Date(), snapshot: local, isSample: false))
        } else {
            completion(context.isPreview ? BFlowEntry.sample() : BFlowEntry.empty())
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BFlowEntry>) -> Void) {
        Task {
            let entry = await BFlowEntryLoader.loadLatest()
            let nextRefresh = Date().addingTimeInterval(Self.refreshInterval)
            completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
        }
    }
}

enum BFlowEntryLoader {
    /// Local (lo que acaba de escribir la app) frente a remoto (otro dispositivo): gana el más
    /// reciente por `updatedAtIso`. Cualquier fallo de red deja el local intacto.
    static func loadLatest() async -> BFlowEntry {
        // Sin credenciales no hay sesión (cerrar sesión borra snapshot y credenciales): estado
        // vacío aunque quede algún snapshot local.
        guard WidgetSharedStorage.loadAuth() != nil else {
            return .empty()
        }
        let remote = await WidgetRemoteSync.shared.latestRemoteSnapshot()
        // Se relee tras la red: la app pudo cerrar sesión o escribir mientras tanto, y la
        // sincronización pudo persistir el remoto.
        guard WidgetSharedStorage.loadAuth() != nil else {
            return .empty()
        }
        let local = WidgetSharedStorage.loadSnapshot()
        // Gana el `updatedAtIso` más reciente (comparado como fecha).
        guard let best = WidgetSnapshotV2.newest(local, remote) else {
            return .empty()
        }
        return BFlowEntry(date: Date(), snapshot: best, isSample: false)
    }
}
