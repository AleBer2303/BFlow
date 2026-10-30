import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Activity Attributes

public struct BFlowActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var monthKey: String
        public var netCashFlowCop: Int
        public var receivedIncomeCop: Int
        public var paidExpensesCop: Int
        public var pendingExpensesCop: Int
        public var checklistCompleted: Int
        public var checklistTotal: Int
        public var totalDebtCop: Int
        public var statusMessage: String

        public init(
            monthKey: String = "2026-10",
            netCashFlowCop: Int = 1_080_000,
            receivedIncomeCop: Int = 4_000_000,
            paidExpensesCop: Int = 2_920_000,
            pendingExpensesCop: Int = 450_000,
            checklistCompleted: Int = 6,
            checklistTotal: Int = 12,
            totalDebtCop: Int = 6_200_000,
            statusMessage: String = "En meta presupuestal"
        ) {
            self.monthKey = monthKey
            self.netCashFlowCop = netCashFlowCop
            self.receivedIncomeCop = receivedIncomeCop
            self.paidExpensesCop = paidExpensesCop
            self.pendingExpensesCop = pendingExpensesCop
            self.checklistCompleted = checklistCompleted
            self.checklistTotal = checklistTotal
            self.totalDebtCop = totalDebtCop
            self.statusMessage = statusMessage
        }
    }

    public var title: String

    public init(title: String = "BFlow Presupuesto") {
        self.title = title
    }
}

// MARK: - Live Activity Widget

public struct BFlowLiveActivity: Widget {
    public init() {}

    public var body: some WidgetConfiguration {
        ActivityConfiguration(for: BFlowActivityAttributes.self) { context in
            // Lock Screen / Banner UI
            LockScreenLiveActivityView(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded Leading
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 4) {
                        Text("BF")
                            .font(.system(size: 11, weight: .black, design: .rounded))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [Color.cyan, Color.blue],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                        Text(WidgetFormatters.formatMonthLabel(context.state.monthKey))
                            .font(.system(size: 10, weight: .semibold, design: .rounded))
                            .foregroundColor(.secondary)
                    }
                    .padding(.leading, 4)
                }

                // Expanded Trailing
                DynamicIslandExpandedRegion(.trailing) {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(Color(red: 0.2, green: 0.85, blue: 0.45))
                        Text("\(context.state.checklistCompleted)/\(context.state.checklistTotal)")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                    }
                    .padding(.trailing, 4)
                }

                // Expanded Center
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 1) {
                        Text("Flujo Neto Disponible")
                            .font(.system(size: 10, weight: .medium, design: .rounded))
                            .foregroundColor(.secondary)
                        Text(WidgetFormatters.formatCop(context.state.netCashFlowCop))
                            .font(.system(size: 18, weight: .bold, design: .rounded))
                            .foregroundColor(Color(red: 0.2, green: 0.85, blue: 0.45))
                    }
                }

                // Expanded Bottom
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 8) {
                        HStack(spacing: 4) {
                            Circle().fill(Color(red: 0.2, green: 0.85, blue: 0.45)).frame(width: 5, height: 5)
                            Text("Recibido: \(WidgetFormatters.formatCopCompact(context.state.receivedIncomeCop))")
                                .font(.system(size: 9, weight: .medium, design: .rounded))
                        }
                        Spacer()
                        HStack(spacing: 4) {
                            Circle().fill(Color(red: 0.65, green: 0.5, blue: 1.0)).frame(width: 5, height: 5)
                            Text("Gastos: \(WidgetFormatters.formatCopCompact(context.state.paidExpensesCop))")
                                .font(.system(size: 9, weight: .medium, design: .rounded))
                        }
                        Spacer()
                        HStack(spacing: 4) {
                            Circle().fill(Color(red: 1.0, green: 0.4, blue: 0.4)).frame(width: 5, height: 5)
                            Text("Deuda: \(WidgetFormatters.formatCopCompact(context.state.totalDebtCop))")
                                .font(.system(size: 9, weight: .medium, design: .rounded))
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.top, 4)
                }
            } compactLeading: {
                // Compact Leading: Mini badge
                HStack(spacing: 2) {
                    Text("BF")
                        .font(.system(size: 10, weight: .black, design: .rounded))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color.cyan, Color.blue],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                }
                .padding(.leading, 4)
            } compactTrailing: {
                // Compact Trailing: Hero amount
                Text(WidgetFormatters.formatCopCompact(context.state.netCashFlowCop))
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(red: 0.2, green: 0.85, blue: 0.45))
                    .padding(.trailing, 4)
            } minimal: {
                // Minimal: Glyph with state dot
                ZStack {
                    Circle()
                        .strokeBorder(Color.blue.opacity(0.6), lineWidth: 1.5)
                        .frame(width: 16, height: 16)
                    Circle()
                        .fill(Color(red: 0.2, green: 0.85, blue: 0.45))
                        .frame(width: 6, height: 6)
                }
            }
        }
    }
}

// MARK: - Lock Screen Banner View

struct LockScreenLiveActivityView: View {
    let state: BFlowActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text("BFLOW")
                        .font(.system(size: 11, weight: .black, design: .rounded))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color.cyan, Color.blue],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                    Text(WidgetFormatters.formatMonthLabel(state.monthKey))
                        .font(.system(size: 10, weight: .semibold, design: .rounded))
                        .foregroundColor(.secondary)
                }

                Text(WidgetFormatters.formatCop(state.netCashFlowCop))
                    .font(.system(size: 19, weight: .bold, design: .rounded))
                    .foregroundColor(Color(red: 0.2, green: 0.85, blue: 0.45))

                Text(state.statusMessage)
                    .font(.system(size: 10, weight: .medium, design: .rounded))
                    .foregroundColor(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                HStack(spacing: 4) {
                    Image(systemName: "checklist")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.cyan)
                    Text("\(state.checklistCompleted)/\(state.checklistTotal)")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Color.white.opacity(0.1))
                .clipShape(Capsule())

                Text("Por Pagar: \(WidgetFormatters.formatCopCompact(state.pendingExpensesCop))")
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(Color(red: 1.0, green: 0.65, blue: 0.2))

                Text("Deuda: \(WidgetFormatters.formatCopCompact(state.totalDebtCop))")
                    .font(.system(size: 9, weight: .medium, design: .rounded))
                    .foregroundColor(Color(red: 1.0, green: 0.4, blue: 0.4))
            }
        }
        .padding(14)
    }
}
