import Charts
import SwiftUI
import WidgetKit

// MARK: - BFlowSummaryWidget
// Mediano: recibido / pagado / por pagar + barras ingresos vs gastos de los últimos meses.

struct BFlowSummaryWidget: Widget {
    static let kind = "BFlowSummaryWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: BFlowTimelineProvider()) { entry in
            SummaryWidgetView(entry: entry)
        }
        .configurationDisplayName("Resumen del mes")
        .description("Ingresos, gastos y tendencia de los últimos meses.")
        .supportedFamilies([.systemMedium])
    }
}

struct SummaryWidgetView: View {
    let entry: BFlowEntry

    var body: some View {
        WidgetRoot(entry: entry, link: .summary) { snapshot in
            SummaryMediumView(snapshot: snapshot)
        }
    }
}

struct SummaryMediumView: View {
    let snapshot: WidgetSnapshotV2

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            WidgetHeader(title: "Resumen", monthKey: snapshot.monthKey, updatedAt: snapshot.updatedAt, showsRefresh: true)

            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 3) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Flujo neto")
                            .font(.caption2)
                            .foregroundStyle(WidgetPalette.textSecondary)
                        WidgetAmountText(
                            text: snapshot.signedMoney(snapshot.netCashFlow),
                            amount: snapshot.netCashFlow,
                            font: .headline.weight(.bold),
                            color: WidgetPalette.flow(snapshot.netCashFlow),
                            accentable: true
                        )
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Flujo neto del mes: \(snapshot.spoken(snapshot.netCashFlow))")

                    WidgetMetricRow(
                        symbol: "arrow.down.left",
                        label: "Recibido",
                        amountText: snapshot.compactMoney(snapshot.receivedIncome),
                        amount: snapshot.receivedIncome,
                        color: WidgetPalette.income,
                        spokenLabel: "Ingresos recibidos: \(snapshot.spoken(snapshot.receivedIncome))"
                    )
                    WidgetMetricRow(
                        symbol: "arrow.up.right",
                        label: "Pagado",
                        amountText: snapshot.compactMoney(snapshot.paidExpenses),
                        amount: snapshot.paidExpenses,
                        color: WidgetPalette.expense,
                        spokenLabel: "Gastos pagados: \(snapshot.spoken(snapshot.paidExpenses))"
                    )
                    WidgetMetricRow(
                        symbol: "clock",
                        label: "Por pagar",
                        amountText: snapshot.compactMoney(snapshot.pendingExpenses),
                        amount: snapshot.pendingExpenses,
                        color: WidgetPalette.pending,
                        spokenLabel: "Por pagar: \(snapshot.spoken(snapshot.pendingExpenses))"
                    )
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                VStack(alignment: .leading, spacing: 4) {
                    TrendBarsChart(trend: snapshot.trend)
                    HStack(spacing: 8) {
                        TrendLegendDot(color: WidgetPalette.income, label: "Ingresos")
                        TrendLegendDot(color: WidgetPalette.expense, label: "Gastos")
                    }
                }
                .frame(maxWidth: .infinity)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Gráfico de tendencia

/// Barras agrupadas por mes, sin eje Y ni rejilla: en un mediano solo importa la comparación.
/// En modo tintado/claro (accented) los colores se aplanan, así que los gastos van además
/// atenuados para que las dos series sigan distinguiéndose.
struct TrendBarsChart: View {
    let trend: [WidgetTrendPointV2]
    @Environment(\.widgetRenderingMode) private var renderingMode

    struct Bar: Identifiable {
        let id: String
        let monthKey: String
        let series: String
        let value: Int
    }

    private var bars: [Bar] {
        trend.flatMap { point in
            [
                Bar(id: "\(point.monthKey)_income", monthKey: point.monthKey, series: "Ingresos", value: point.receivedIncome),
                Bar(id: "\(point.monthKey)_expense", monthKey: point.monthKey, series: "Gastos", value: point.paidExpenses),
            ]
        }
    }

    private var expenseOpacity: Double {
        renderingMode == .fullColor ? 1 : 0.45
    }

    var body: some View {
        Chart(bars) { bar in
            BarMark(
                x: .value("Mes", bar.monthKey),
                y: .value("Monto", bar.value)
            )
            .position(by: .value("Serie", bar.series))
            .foregroundStyle(by: .value("Serie", bar.series))
            .opacity(bar.series == "Gastos" ? expenseOpacity : 1)
            .cornerRadius(2)
        }
        .chartForegroundStyleScale([
            "Ingresos": WidgetPalette.income,
            "Gastos": WidgetPalette.expense,
        ])
        .chartLegend(.hidden)
        .chartYAxis(.hidden)
        .chartXAxis {
            AxisMarks { value in
                AxisValueLabel {
                    if let monthKey = value.as(String.self) {
                        Text(WidgetFormat.monthShortLabel(monthKey))
                            .font(.system(size: 9, weight: .medium))
                            .foregroundStyle(WidgetPalette.textSecondary)
                    }
                }
            }
        }
        .widgetAccentable()
        .privacySensitive()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
    }

    private var accessibilitySummary: String {
        guard let first = trend.first, let last = trend.last else { return "Sin tendencia" }
        if trend.count == 1 {
            return "Tendencia: un mes, \(WidgetFormat.monthLabel(last.monthKey))"
        }
        return "Tendencia de ingresos y gastos de \(WidgetFormat.monthLabel(first.monthKey)) a \(WidgetFormat.monthLabel(last.monthKey))"
    }
}

struct TrendLegendDot: View {
    let color: Color
    let label: String

    var body: some View {
        HStack(spacing: 3) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(label)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(WidgetPalette.textSecondary)
                .lineLimit(1)
        }
        .accessibilityHidden(true)
    }
}
