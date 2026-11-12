import SwiftUI
import WidgetKit

// MARK: - BFlowNetFlowWidget
// Pequeño: flujo neto del mes + checklist. Pantalla de bloqueo: gauge del checklist,
// rectangular (flujo + pendientes) e inline.

struct BFlowNetFlowWidget: Widget {
    static let kind = "BFlowNetFlowWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: BFlowTimelineProvider()) { entry in
            NetFlowWidgetView(entry: entry)
        }
        .configurationDisplayName("Flujo del mes")
        .description("Tu flujo neto y el avance del checklist.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct NetFlowWidgetView: View {
    let entry: BFlowEntry
    @Environment(\.widgetFamily) private var family

    /// El gauge del checklist abre el checklist; el resto, el resumen.
    private var link: WidgetDeepLink {
        family == .accessoryCircular ? .checklist : .summary
    }

    var body: some View {
        WidgetRoot(entry: entry, link: link) { snapshot in
            switch family {
            case .accessoryCircular:
                NetFlowCircularView(snapshot: snapshot)
            case .accessoryRectangular:
                NetFlowRectangularView(snapshot: snapshot)
            case .accessoryInline:
                NetFlowInlineView(snapshot: snapshot)
            default:
                NetFlowSmallView(snapshot: snapshot)
            }
        }
    }
}

private func netFlowSpokenLabel(_ snapshot: WidgetSnapshotV2) -> String {
    "Flujo neto de \(snapshot.monthLabel): \(snapshot.spoken(snapshot.netCashFlow))"
}

private func checklistSpokenLabel(_ snapshot: WidgetSnapshotV2) -> String {
    "Checklist: \(snapshot.checklistCompleted) de \(snapshot.checklistTotal) completados"
}

// MARK: Pequeño

struct NetFlowSmallView: View {
    let snapshot: WidgetSnapshotV2

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: "Flujo neto", monthKey: snapshot.monthKey)

            Spacer(minLength: 6)

            HStack(spacing: 4) {
                Image(systemName: snapshot.flowSymbol)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(WidgetPalette.flow(snapshot.netCashFlow))
                    .widgetAccentable()
                Text(snapshot.netCashFlow < 0 ? "Déficit" : "Disponible")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(WidgetPalette.textSecondary)
            }
            .accessibilityHidden(true)

            WidgetAmountText(
                text: snapshot.signedMoney(snapshot.netCashFlow),
                amount: snapshot.netCashFlow,
                font: .title2.weight(.bold),
                color: WidgetPalette.flow(snapshot.netCashFlow),
                accentable: true
            )
            .accessibilityLabel(netFlowSpokenLabel(snapshot))

            Spacer(minLength: 6)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Image(systemName: "checklist")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(WidgetPalette.completed)
                    Text(snapshot.checklistLabel)
                        .font(.caption2.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(WidgetPalette.textPrimary)
                        .contentTransition(.numericText(value: Double(snapshot.checklistCompleted)))
                }
                WidgetProgressBar(fraction: snapshot.checklistFraction, tint: WidgetPalette.completed, height: 4)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(checklistSpokenLabel(snapshot))

            WidgetUpdatedLabel(date: snapshot.updatedAt)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: Pantalla de bloqueo

struct NetFlowCircularView: View {
    let snapshot: WidgetSnapshotV2

    var body: some View {
        Gauge(value: Double(snapshot.checklistCompleted), in: 0...Double(max(1, snapshot.checklistTotal))) {
            Image(systemName: "checklist")
        } currentValueLabel: {
            Text("\(snapshot.checklistCompleted)/\(snapshot.checklistTotal)")
                .monospacedDigit()
                .minimumScaleFactor(0.5)
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .widgetAccentable()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(checklistSpokenLabel(snapshot))
    }
}

struct NetFlowRectangularView: View {
    let snapshot: WidgetSnapshotV2

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("Flujo · \(snapshot.monthLabel)")
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
            HStack(spacing: 3) {
                Image(systemName: snapshot.flowSymbol)
                    .font(.caption.weight(.bold))
                Text(snapshot.signedMoney(snapshot.netCashFlow))
                    .font(.headline)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .privacySensitive()
            }
            .widgetAccentable()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(netFlowSpokenLabel(snapshot))

            Text("Por pagar \(snapshot.compactMoney(snapshot.pendingExpenses)) · \(snapshot.checklistCompleted)/\(snapshot.checklistTotal)")
                .font(.caption2)
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .privacySensitive()
                .accessibilityLabel("Por pagar: \(snapshot.spoken(snapshot.pendingExpenses)). \(checklistSpokenLabel(snapshot))")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct NetFlowInlineView: View {
    let snapshot: WidgetSnapshotV2

    var body: some View {
        Label {
            Text("\(snapshot.signedCompactMoney(snapshot.netCashFlow)) · \(snapshot.checklistCompleted)/\(snapshot.checklistTotal)")
                .privacySensitive()
        } icon: {
            Image(systemName: snapshot.flowSymbol)
        }
        .accessibilityLabel("\(netFlowSpokenLabel(snapshot)). \(checklistSpokenLabel(snapshot))")
    }
}
