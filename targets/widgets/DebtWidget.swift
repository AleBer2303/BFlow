import SwiftUI
import WidgetKit

// MARK: - BFlowDebtWidget
// Pequeño / mediano: deuda restante y progreso pagado desde el primer mes con deudas.
// Pantalla de bloqueo: gauge del porcentaje pagado.

struct BFlowDebtWidget: Widget {
    static let kind = "BFlowDebtWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: BFlowTimelineProvider()) { entry in
            DebtWidgetView(entry: entry)
        }
        .configurationDisplayName("Deudas")
        .description("Cuánto debes y cuánto llevas pagado.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
    }
}

struct DebtWidgetView: View {
    let entry: BFlowEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        WidgetRoot(entry: entry, link: .debts) { snapshot in
            switch family {
            case .accessoryCircular:
                DebtCircularView(snapshot: snapshot)
            case .systemMedium:
                DebtMediumView(snapshot: snapshot)
            default:
                DebtSmallView(snapshot: snapshot)
            }
        }
    }
}

extension WidgetSnapshotV2 {
    /// "desde Jun 2026" (vacío si no se conoce el mes base).
    var debtSinceLabel: String {
        guard let since = debtSinceMonthKey else { return "" }
        return "desde \(WidgetFormat.monthLabel(since))"
    }

    var debtProgressSpoken: String {
        let since = debtSinceMonthKey.map { " desde \(WidgetFormat.monthLabel($0))" } ?? ""
        return "Pagado \(WidgetFormat.percent(debtPaidFraction))\(since)"
    }

    var debtRemainingSpoken: String {
        "Deuda restante: \(spoken(totalDebt))"
    }
}

/// Estado sin deudas: celebra en lugar de mostrar una barra vacía.
struct DebtFreeView: View {
    var compact: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "checkmark.seal.fill")
                .font(compact ? .title3 : .title2)
                .foregroundStyle(WidgetPalette.completed)
                .widgetAccentable()
            Text("Sin deudas")
                .font(.headline)
                .foregroundStyle(WidgetPalette.textPrimary)
            Text("No tienes deudas registradas.")
                .font(.caption)
                .foregroundStyle(WidgetPalette.textSecondary)
                .lineLimit(2)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: Pequeño

struct DebtSmallView: View {
    let snapshot: WidgetSnapshotV2

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: "Deudas", monthKey: snapshot.monthKey)

            Spacer(minLength: 6)

            if snapshot.hasNoDebts {
                DebtFreeView(compact: true)
            } else {
                Text("Restante")
                    .font(.caption2)
                    .foregroundStyle(WidgetPalette.textSecondary)
                WidgetAmountText(
                    text: snapshot.money(snapshot.totalDebt),
                    amount: snapshot.totalDebt,
                    font: .title3.weight(.bold),
                    color: WidgetPalette.debt,
                    accentable: true
                )
                .accessibilityLabel(snapshot.debtRemainingSpoken)

                Spacer(minLength: 6)

                VStack(alignment: .leading, spacing: 4) {
                    WidgetProgressBar(fraction: snapshot.debtPaidFraction, tint: WidgetPalette.completed)
                    Text("\(WidgetFormat.percent(snapshot.debtPaidFraction)) pagado \(snapshot.debtSinceLabel)")
                        .font(.caption2)
                        .monospacedDigit()
                        .foregroundStyle(WidgetPalette.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(snapshot.debtProgressSpoken)
            }

            WidgetUpdatedLabel(date: snapshot.updatedAt)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: Mediano

struct DebtMediumView: View {
    let snapshot: WidgetSnapshotV2

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(title: "Deudas", monthKey: snapshot.monthKey, updatedAt: snapshot.updatedAt, showsRefresh: true)

            if snapshot.hasNoDebts {
                Spacer(minLength: 0)
                DebtFreeView(compact: false)
                Spacer(minLength: 0)
            } else {
                HStack(alignment: .top, spacing: 14) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Deuda restante")
                            .font(.caption)
                            .foregroundStyle(WidgetPalette.textSecondary)
                        WidgetAmountText(
                            text: snapshot.money(snapshot.totalDebt),
                            amount: snapshot.totalDebt,
                            font: .title2.weight(.bold),
                            color: WidgetPalette.debt,
                            accentable: true
                        )
                        .accessibilityLabel(snapshot.debtRemainingSpoken)
                        Text("de \(snapshot.money(snapshot.initialDebt)) \(snapshot.debtSinceLabel)")
                            .font(.caption2)
                            .monospacedDigit()
                            .foregroundStyle(WidgetPalette.textSecondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .privacySensitive()
                            .accessibilityLabel("Deuda inicial: \(snapshot.spoken(snapshot.initialDebt))")
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    VStack(alignment: .leading, spacing: 4) {
                        WidgetMetricRow(
                            symbol: "arrow.down.circle",
                            label: "Abonado este mes",
                            amountText: snapshot.compactMoney(snapshot.paidDebtThisMonth),
                            amount: snapshot.paidDebtThisMonth,
                            color: WidgetPalette.completed,
                            spokenLabel: "Abonado este mes: \(snapshot.spoken(snapshot.paidDebtThisMonth))"
                        )
                        if let payoff = snapshot.estimatedPayoffMonthKey {
                            HStack(spacing: 6) {
                                Image(systemName: "flag.checkered")
                                    .font(.caption2.weight(.bold))
                                    .foregroundStyle(WidgetPalette.accent)
                                    .frame(width: 14)
                                Text("Cierre estimado")
                                    .font(.caption)
                                    .foregroundStyle(WidgetPalette.textSecondary)
                                    .lineLimit(1)
                                Spacer(minLength: 4)
                                Text(WidgetFormat.monthLabel(payoff))
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(WidgetPalette.textPrimary)
                                    .lineLimit(1)
                            }
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("Cierre estimado: \(WidgetFormat.monthLabel(payoff))")
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                Spacer(minLength: 0)

                VStack(alignment: .leading, spacing: 4) {
                    WidgetProgressBar(fraction: snapshot.debtPaidFraction, tint: WidgetPalette.completed, height: 8)
                    Text("\(WidgetFormat.percent(snapshot.debtPaidFraction)) pagado \(snapshot.debtSinceLabel)")
                        .font(.caption2)
                        .monospacedDigit()
                        .foregroundStyle(WidgetPalette.textSecondary)
                        .lineLimit(1)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(snapshot.debtProgressSpoken)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: Pantalla de bloqueo

struct DebtCircularView: View {
    let snapshot: WidgetSnapshotV2

    var body: some View {
        if snapshot.hasNoDebts {
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "checkmark.seal.fill")
                    .font(.title3)
                    .widgetAccentable()
            }
            .accessibilityLabel("Sin deudas")
        } else {
            Gauge(value: snapshot.debtPaidFraction, in: 0...1) {
                Image(systemName: "creditcard")
            } currentValueLabel: {
                Text(WidgetFormat.percent(snapshot.debtPaidFraction))
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .widgetAccentable()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(snapshot.debtProgressSpoken)
        }
    }
}
