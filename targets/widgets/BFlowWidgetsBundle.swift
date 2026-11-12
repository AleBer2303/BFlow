import SwiftUI
import WidgetKit

/// Único target de extensión (límite de App IDs de la cuenta gratuita, AGENTS.md):
/// todos los widgets viven en este bundle y comparten `BFlowTimelineProvider`.
@main
struct BFlowWidgetsBundle: WidgetBundle {
    var body: some Widget {
        BFlowNetFlowWidget()
        BFlowSummaryWidget()
        BFlowPendingWidget()
        BFlowDebtWidget()
        BFlowSavingsWidget()
    }
}
