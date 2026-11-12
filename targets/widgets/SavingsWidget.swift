import SwiftUI
import WidgetKit

// MARK: - BFlowSavingsWidget
// Pequeño / mediano: total ahorrado y desglose por bolsillo con los nombres del snapshot.

struct BFlowSavingsWidget: Widget {
    static let kind = "BFlowSavingsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: BFlowTimelineProvider()) { entry in
            SavingsWidgetView(entry: entry)
        }
        .configurationDisplayName("Ahorros")
        .description("Tu total ahorrado y cómo se reparte.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct SavingsWidgetView: View {
    let entry: BFlowEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        WidgetRoot(entry: entry, link: .savings) { snapshot in
            if family == .systemMedium {
                SavingsMediumView(snapshot: snapshot)
            } else {
                SavingsSmallView(snapshot: snapshot)
            }
        }
    }
}

/// Un bolsillo del desglose (reserva, ahorro y, si hay saldo, "Otros").
struct SavingsBucketItem: Identifiable {
    let id: String
    let name: String
    let balance: Int
    let color: Color
}

extension WidgetSnapshotV2 {
    var savingsBuckets: [SavingsBucketItem] {
        var items = [
            SavingsBucketItem(id: "reserve", name: reserveName, balance: reserveBalance, color: WidgetPalette.reserve),
            SavingsBucketItem(id: "savings", name: savingsName, balance: savingsBalance, color: WidgetPalette.savings),
        ]
        if otherSavingsBalance > 0 {
            items.append(SavingsBucketItem(id: "other", name: "Otros", balance: otherSavingsBalance, color: WidgetPalette.accent))
        }
        return items
    }
}

// MARK: Pequeño

struct SavingsSmallView: View {
    let snapshot: WidgetSnapshotV2

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetHeader(title: "Ahorros", monthKey: snapshot.monthKey)

            Spacer(minLength: 6)

            Text("Total")
                .font(.caption2)
                .foregroundStyle(WidgetPalette.textSecondary)
            WidgetAmountText(
                text: snapshot.money(snapshot.totalSavings),
                amount: snapshot.totalSavings,
                font: .title3.weight(.bold),
                color: WidgetPalette.savings,
                accentable: true
            )
            .accessibilityLabel("Total ahorrado: \(snapshot.spoken(snapshot.totalSavings))")

            Spacer(minLength: 6)

            VStack(alignment: .leading, spacing: 3) {
                ForEach(snapshot.savingsBuckets) { bucket in
                    SavingsBucketRow(bucket: bucket, amountText: snapshot.compactMoney(bucket.balance), snapshot: snapshot)
                }
            }
            // Sin "hace X min": con tres bolsillos no cabe en el pequeño sin recortar cifras.
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: Mediano

struct SavingsMediumView: View {
    let snapshot: WidgetSnapshotV2

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            WidgetHeader(title: "Ahorros", monthKey: snapshot.monthKey, updatedAt: snapshot.updatedAt, showsRefresh: true)

            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Total ahorrado")
                        .font(.caption)
                        .foregroundStyle(WidgetPalette.textSecondary)
                    WidgetAmountText(
                        text: snapshot.money(snapshot.totalSavings),
                        amount: snapshot.totalSavings,
                        font: .title2.weight(.bold),
                        color: WidgetPalette.savings,
                        accentable: true
                    )
                    .accessibilityLabel("Total ahorrado: \(snapshot.spoken(snapshot.totalSavings))")
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                VStack(alignment: .leading, spacing: 4) {
                    ForEach(snapshot.savingsBuckets) { bucket in
                        SavingsBucketRow(bucket: bucket, amountText: snapshot.money(bucket.balance), snapshot: snapshot)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            Spacer(minLength: 0)

            SavingsDistributionBar(buckets: snapshot.savingsBuckets)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct SavingsBucketRow: View {
    let bucket: SavingsBucketItem
    let amountText: String
    let snapshot: WidgetSnapshotV2

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(bucket.color)
                .frame(width: 7, height: 7)
            Text(bucket.name)
                .font(.caption)
                .foregroundStyle(WidgetPalette.textSecondary)
                .lineLimit(1)
            Spacer(minLength: 4)
            Text(amountText)
                .font(.caption.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(WidgetPalette.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .contentTransition(.numericText(value: Double(bucket.balance)))
                .privacySensitive()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(bucket.name): \(snapshot.spoken(bucket.balance))")
    }
}

/// Reparto proporcional del total entre bolsillos (saldos negativos cuentan como cero).
/// En modo tintado los tramos se separan por opacidad, no solo por color.
struct SavingsDistributionBar: View {
    let buckets: [SavingsBucketItem]
    @Environment(\.widgetRenderingMode) private var renderingMode

    private var positiveTotal: Int {
        buckets.reduce(0) { $0 + max(0, $1.balance) }
    }

    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 2) {
                if positiveTotal > 0 {
                    ForEach(Array(buckets.enumerated()), id: \.element.id) { index, bucket in
                        let share = CGFloat(max(0, bucket.balance)) / CGFloat(positiveTotal)
                        let spacing = CGFloat(max(0, buckets.count - 1)) * 2
                        Capsule()
                            .fill(bucket.color)
                            .opacity(segmentOpacity(index))
                            .frame(width: max(0, (proxy.size.width - spacing) * share))
                            .widgetAccentable()
                    }
                } else {
                    Capsule()
                        .fill(WidgetPalette.track)
                }
            }
        }
        .frame(height: 8)
        .accessibilityHidden(true)
    }

    private func segmentOpacity(_ index: Int) -> Double {
        guard renderingMode != .fullColor else { return 1 }
        return max(0.35, 1 - Double(index) * 0.3)
    }
}
