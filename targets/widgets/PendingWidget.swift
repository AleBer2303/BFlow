import SwiftUI
import WidgetKit

// MARK: - BFlowPendingWidget
// Grande: progreso del checklist, totales por pagar / por recibir y los pendientes con monto.

struct BFlowPendingWidget: Widget {
    static let kind = "BFlowPendingWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: BFlowTimelineProvider()) { entry in
            PendingWidgetView(entry: entry)
        }
        .configurationDisplayName("Pendientes del mes")
        .description("Lo que falta por pagar y por recibir este mes.")
        .supportedFamilies([.systemLarge])
    }
}

struct PendingWidgetView: View {
    let entry: BFlowEntry

    var body: some View {
        WidgetRoot(entry: entry, link: .checklist) { snapshot in
            PendingLargeView(snapshot: snapshot)
        }
    }
}

struct PendingLargeView: View {
    let snapshot: WidgetSnapshotV2

    /// Filas visibles: con 6 caben progreso, totales y lista en todos los tamaños de iPhone.
    private static let maxVisibleRows = 6

    private var visibleItems: [WidgetPendingItemV2] {
        Array(snapshot.pendingItems.prefix(Self.maxVisibleRows))
    }

    private var hiddenCount: Int {
        max(0, snapshot.pendingItems.count - Self.maxVisibleRows)
    }

    private var hiddenText: String {
        hiddenCount == 1 ? "y 1 pendiente más" : "y \(hiddenCount) pendientes más"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            WidgetHeader(title: "Pendientes", monthKey: snapshot.monthKey, updatedAt: snapshot.updatedAt, showsRefresh: true)

            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text("Checklist")
                        .font(.caption)
                        .foregroundStyle(WidgetPalette.textSecondary)
                    Spacer(minLength: 4)
                    Text("\(snapshot.checklistLabel) completados")
                        .font(.caption.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(WidgetPalette.textPrimary)
                        .contentTransition(.numericText(value: Double(snapshot.checklistCompleted)))
                }
                WidgetProgressBar(fraction: snapshot.checklistFraction, tint: WidgetPalette.completed)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Checklist: \(snapshot.checklistCompleted) de \(snapshot.checklistTotal) completados")

            HStack(spacing: 10) {
                PendingTotalTile(
                    symbol: "arrow.up.right",
                    label: "Por pagar",
                    amount: snapshot.pendingExpenses,
                    snapshot: snapshot,
                    color: WidgetPalette.expense
                )
                PendingTotalTile(
                    symbol: "arrow.down.left",
                    label: "Por recibir",
                    amount: snapshot.pendingIncome,
                    snapshot: snapshot,
                    color: WidgetPalette.income
                )
            }

            if visibleItems.isEmpty {
                Spacer(minLength: 0)
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.title3)
                        .foregroundStyle(WidgetPalette.completed)
                        .widgetAccentable()
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Todo al día")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(WidgetPalette.textPrimary)
                        Text("No quedan pendientes este mes.")
                            .font(.caption)
                            .foregroundStyle(WidgetPalette.textSecondary)
                    }
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .combine)
                Spacer(minLength: 0)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(visibleItems.enumerated()), id: \.element.id) { index, item in
                        if index > 0 {
                            Divider()
                                .overlay(WidgetPalette.track)
                        }
                        PendingItemRow(item: item, snapshot: snapshot)
                    }
                }
                Spacer(minLength: 0)
                if hiddenCount > 0 {
                    Text(hiddenText)
                        .font(.caption2)
                        .foregroundStyle(WidgetPalette.textSecondary)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct PendingTotalTile: View {
    let symbol: String
    let label: String
    let amount: Int
    let snapshot: WidgetSnapshotV2
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: symbol)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(color)
                Text(label)
                    .font(.caption)
                    .foregroundStyle(WidgetPalette.textSecondary)
                    .lineLimit(1)
            }
            WidgetAmountText(
                text: snapshot.money(amount),
                amount: amount,
                font: .headline.weight(.bold),
                color: color,
                accentable: true
            )
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(snapshot.spoken(amount))")
    }
}

struct PendingItemRow: View {
    let item: WidgetPendingItemV2
    let snapshot: WidgetSnapshotV2

    private var color: Color {
        item.isIncome ? WidgetPalette.income : WidgetPalette.expense
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: item.isIncome ? "arrow.down.left.circle.fill" : "arrow.up.right.circle.fill")
                .font(.subheadline)
                .foregroundStyle(color)
                .widgetAccentable()
            Text(item.name)
                .font(.subheadline)
                .foregroundStyle(WidgetPalette.textPrimary)
                .lineLimit(1)
            Spacer(minLength: 6)
            Text(amountText)
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(WidgetPalette.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .privacySensitive()
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenLabel)
    }

    /// El signo repite el tipo para los modos sin color (tintado / transparente):
    /// "+$ 250.000" por recibir, "-$ 250.000" por pagar.
    private var amountText: String {
        let formatted = snapshot.money(item.amount)
        return item.isIncome ? "+\(formatted)" : "-\(formatted)"
    }

    private var spokenLabel: String {
        let kind = item.isIncome ? "Por recibir" : "Por pagar"
        return "\(kind): \(item.name), \(snapshot.spoken(item.amount))"
    }
}
