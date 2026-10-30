import SwiftUI
import WidgetKit

// MARK: - Timeline Entry

public struct BFlowWidgetEntry: TimelineEntry {
    public let date: Date
    public let snapshot: WidgetSnapshotV1

    public init(date: Date, snapshot: WidgetSnapshotV1) {
        self.date = date
        self.snapshot = snapshot
    }
}

// MARK: - Timeline Provider

public struct BFlowTimelineProvider: TimelineProvider {
    public typealias Entry = BFlowWidgetEntry

    public init() {}

    public func placeholder(in context: Context) -> BFlowWidgetEntry {
        BFlowWidgetEntry(date: Date(), snapshot: .goldenFallback)
    }

    public func getSnapshot(in context: Context, completion: @escaping (BFlowWidgetEntry) -> Void) {
        let snapshot = WidgetStorageBridge.loadSnapshot()
        completion(BFlowWidgetEntry(date: Date(), snapshot: snapshot))
    }

    public func getTimeline(in context: Context, completion: @escaping (Timeline<BFlowWidgetEntry>) -> Void) {
        let snapshot = WidgetStorageBridge.loadSnapshot()
        let entry = BFlowWidgetEntry(date: Date(), snapshot: snapshot)

        // Instant timeline invalidation: policy .atEnd ensures that whenever WidgetCenter.reloadAllTimelines()
        // is triggered, WidgetKit immediately requests the latest snapshot without waiting for a timer.
        let timeline = Timeline(entries: [entry], policy: .atEnd)
        completion(timeline)
    }
}

// MARK: - Liquid Glass Background

public struct WidgetBackgroundView: View {
    public init() {}

    public var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.07, green: 0.09, blue: 0.15),
                    Color(red: 0.04, green: 0.05, blue: 0.09)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            // Subtle ambient glows (Liquid Glass)
            RadialGradient(
                colors: [Color.blue.opacity(0.18), Color.clear],
                center: .topLeading,
                startRadius: 5,
                endRadius: 140
            )
            RadialGradient(
                colors: [Color.green.opacity(0.12), Color.clear],
                center: .bottomTrailing,
                startRadius: 5,
                endRadius: 120
            )
        }
    }
}

// MARK: - Small Widget View

public struct SmallWidgetView: View {
    let snapshot: WidgetSnapshotV1

    public init(snapshot: WidgetSnapshotV1) {
        self.snapshot = snapshot
    }

    private var isPositive: Bool {
        snapshot.netCashFlowCop >= 0
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("BFLOW")
                    .font(.system(size: 11, weight: .black, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(red: 0.4, green: 0.7, blue: 1.0), Color.blue],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                Spacer()
                Text(WidgetFormatters.formatMonthLabel(snapshot.monthKey))
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.white.opacity(0.08))
                    .clipShape(Capsule())
            }

            Spacer()

            VStack(alignment: .leading, spacing: 2) {
                Text("Flujo Neto")
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundColor(.secondary)

                Text(WidgetFormatters.formatCop(snapshot.netCashFlowCop))
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundColor(isPositive ? Color(red: 0.2, green: 0.85, blue: 0.45) : Color(red: 1.0, green: 0.35, blue: 0.35))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }

            Spacer()

            HStack {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Color(red: 0.2, green: 0.85, blue: 0.45))
                    Text("\(snapshot.checklistCompleted)/\(snapshot.checklistTotal)")
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .foregroundColor(.primary)
                }
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(Color.white.opacity(0.08))
                .clipShape(Capsule())

                Spacer()

                Text("En Meta")
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .foregroundColor(Color(red: 0.2, green: 0.85, blue: 0.45))
            }
        }
        .padding(14)
    }
}

// MARK: - Medium Widget View

public struct MediumWidgetView: View {
    let snapshot: WidgetSnapshotV1

    public init(snapshot: WidgetSnapshotV1) {
        self.snapshot = snapshot
    }

    public var body: some View {
        HStack(spacing: 14) {
            // Left Column: Net flow hero
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text("BFLOW")
                        .font(.system(size: 11, weight: .black, design: .rounded))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color(red: 0.4, green: 0.7, blue: 1.0), Color.blue],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                    Text(WidgetFormatters.formatMonthLabel(snapshot.monthKey))
                        .font(.system(size: 10, weight: .semibold, design: .rounded))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.white.opacity(0.08))
                        .clipShape(Capsule())
                }

                Spacer()

                Text("Flujo Neto")
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundColor(.secondary)

                Text(WidgetFormatters.formatCop(snapshot.netCashFlowCop))
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundColor(Color(red: 0.2, green: 0.85, blue: 0.45))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Spacer()

                HStack(spacing: 5) {
                    Image(systemName: "checklist")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.cyan)
                    Text("\(snapshot.checklistCompleted) de \(snapshot.checklistTotal) listos")
                        .font(.system(size: 10, weight: .semibold, design: .rounded))
                        .foregroundColor(.primary)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Color.white.opacity(0.08))
                .clipShape(Capsule())
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            // Right Column: Breakdown metrics
            VStack(alignment: .leading, spacing: 7) {
                MetricRow(
                    label: "Recibido",
                    amount: snapshot.receivedIncomeCop,
                    color: Color(red: 0.2, green: 0.85, blue: 0.45)
                )

                MetricRow(
                    label: "Pagado",
                    amount: snapshot.paidExpensesCop,
                    color: Color(red: 0.65, green: 0.5, blue: 1.0)
                )

                MetricRow(
                    label: "Por Pagar",
                    amount: snapshot.pendingExpensesCop,
                    color: Color(red: 1.0, green: 0.65, blue: 0.2)
                )

                Divider().background(Color.white.opacity(0.12))

                HStack {
                    Text("Deuda Restante")
                        .font(.system(size: 9, weight: .medium, design: .rounded))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text(WidgetFormatters.formatCopCompact(snapshot.totalDebtCop))
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundColor(Color(red: 1.0, green: 0.4, blue: 0.4))
                }
            }
            .padding(10)
            .background(Color.white.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .frame(maxWidth: .infinity)
        }
        .padding(14)
    }
}

// MARK: - Metric Row Helper

struct MetricRow: View {
    let label: String
    let amount: Int
    let color: Color

    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(label)
                .font(.system(size: 10, weight: .medium, design: .rounded))
                .foregroundColor(.secondary)
            Spacer()
            Text(WidgetFormatters.formatCopCompact(amount))
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(.primary)
        }
    }
}

// MARK: - Large Widget View

public struct LargeWidgetView: View {
    let snapshot: WidgetSnapshotV1

    public init(snapshot: WidgetSnapshotV1) {
        self.snapshot = snapshot
    }

    private var debtProgress: Double {
        guard snapshot.openingDebtCop > 0 else { return 0 }
        let paid = max(0, snapshot.openingDebtCop - snapshot.totalDebtCop)
        return min(1.0, Double(paid) / Double(snapshot.openingDebtCop))
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("BFLOW")
                        .font(.system(size: 13, weight: .black, design: .rounded))
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color(red: 0.4, green: 0.7, blue: 1.0), Color.blue],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                    Text("Flujo Neto • \(WidgetFormatters.formatMonthLabel(snapshot.monthKey))")
                        .font(.system(size: 10, weight: .medium, design: .rounded))
                        .foregroundColor(.secondary)
                }

                Spacer()

                Text(WidgetFormatters.formatCop(snapshot.netCashFlowCop))
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundColor(Color(red: 0.2, green: 0.85, blue: 0.45))
            }

            // Summary grid 4 pills
            HStack(spacing: 6) {
                MiniCard(title: "Recibido", amount: snapshot.receivedIncomeCop, color: Color(red: 0.2, green: 0.85, blue: 0.45))
                MiniCard(title: "Pagado", amount: snapshot.paidExpensesCop, color: Color(red: 0.65, green: 0.5, blue: 1.0))
                MiniCard(title: "Pendiente", amount: snapshot.pendingExpensesCop, color: Color(red: 1.0, green: 0.65, blue: 0.2))
                MiniCard(title: "Ahorros", amount: snapshot.totalSavingsCop, color: Color.cyan)
            }

            // Checklist section
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text("Checklist Pendiente")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(.primary)
                    Spacer()
                    Text("\(snapshot.checklistCompleted)/\(snapshot.checklistTotal) completados")
                        .font(.system(size: 9, weight: .semibold, design: .rounded))
                        .foregroundColor(.secondary)
                }

                if snapshot.topPendingItems.isEmpty {
                    Text("¡Todo al día en este mes! 🎉")
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundColor(Color(red: 0.2, green: 0.85, blue: 0.45))
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 8)
                } else {
                    ForEach(snapshot.topPendingItems.prefix(3), id: \.id) { item in
                        HStack(spacing: 6) {
                            Circle()
                                .strokeBorder(Color.orange.opacity(0.7), lineWidth: 1.5)
                                .frame(width: 8, height: 8)
                            Text(item.name)
                                .font(.system(size: 10, weight: .medium, design: .rounded))
                                .foregroundColor(.primary)
                                .lineLimit(1)
                            Spacer()
                            Text(WidgetFormatters.formatCop(item.amountCop))
                                .font(.system(size: 10, weight: .bold, design: .rounded))
                                .foregroundColor(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
            .padding(10)
            .background(Color.white.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 10))

            // Debt Waterfall Bar
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Plan Desendeudamiento")
                        .font(.system(size: 10, weight: .semibold, design: .rounded))
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("\(Int(debtProgress * 100))% saldado")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .foregroundColor(Color(red: 0.2, green: 0.85, blue: 0.45))
                }

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color.white.opacity(0.1))
                            .frame(height: 6)
                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [Color.blue, Color(red: 0.2, green: 0.85, blue: 0.45)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: max(6, geo.size.width * CGFloat(debtProgress)), height: 6)
                    }
                }
                .frame(height: 6)

                HStack {
                    Text("Resta: \(WidgetFormatters.formatCop(snapshot.totalDebtCop))")
                        .font(.system(size: 9, weight: .semibold, design: .rounded))
                        .foregroundColor(Color(red: 1.0, green: 0.4, blue: 0.4))
                    Spacer()
                    Text("Meta Moto: \(WidgetFormatters.formatCopCompact(snapshot.motoSavingsCop))")
                        .font(.system(size: 9, weight: .semibold, design: .rounded))
                        .foregroundColor(.cyan)
                }
            }
            .padding(10)
            .background(Color.white.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .padding(14)
    }
}

// MARK: - Mini Card Helper

struct MiniCard: View {
    let title: String
    let amount: Int
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(title)
                .font(.system(size: 8, weight: .medium, design: .rounded))
                .foregroundColor(.secondary)
            Text(WidgetFormatters.formatCopCompact(amount))
                .font(.system(size: 10, weight: .bold, design: .rounded))
                .foregroundColor(color)
                .minimumScaleFactor(0.8)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 5)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 7))
    }
}

// MARK: - Lock Screen Accessories

public struct AccessoryCircularView: View {
    let snapshot: WidgetSnapshotV1

    public init(snapshot: WidgetSnapshotV1) {
        self.snapshot = snapshot
    }

    private var progress: Double {
        guard snapshot.checklistTotal > 0 else { return 1.0 }
        return min(1.0, Double(snapshot.checklistCompleted) / Double(snapshot.checklistTotal))
    }

    public var body: some View {
        Gauge(value: progress) {
            Text("BF")
                .font(.system(size: 9, weight: .black, design: .rounded))
        } currentValueLabel: {
            Text("\(snapshot.checklistCompleted)")
                .font(.system(size: 12, weight: .bold, design: .rounded))
        }
        .gaugeStyle(.accessoryCircular)
    }
}

public struct AccessoryRectangularView: View {
    let snapshot: WidgetSnapshotV1

    public init(snapshot: WidgetSnapshotV1) {
        self.snapshot = snapshot
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Text("BFLOW")
                    .font(.system(size: 9, weight: .black, design: .rounded))
                Text("• \(WidgetFormatters.formatMonthLabel(snapshot.monthKey))")
                    .font(.system(size: 8, weight: .medium, design: .rounded))
                    .foregroundColor(.secondary)
            }

            Text(WidgetFormatters.formatCop(snapshot.netCashFlowCop))
                .font(.system(size: 14, weight: .bold, design: .rounded))

            Text("\(snapshot.checklistCompleted)/\(snapshot.checklistTotal) listos • \(WidgetFormatters.formatCopCompact(snapshot.pendingExpensesCop)) pend.")
                .font(.system(size: 9, weight: .regular, design: .rounded))
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
    }
}

public struct AccessoryInlineView: View {
    let snapshot: WidgetSnapshotV1

    public init(snapshot: WidgetSnapshotV1) {
        self.snapshot = snapshot
    }

    public var body: some View {
        Text("BFlow: \(WidgetFormatters.formatCop(snapshot.netCashFlowCop)) neto (\(snapshot.checklistCompleted)/\(snapshot.checklistTotal))")
    }
}

// MARK: - Main Widget Entry View Switcher

public struct BFlowWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: BFlowWidgetEntry

    public init(entry: BFlowWidgetEntry) {
        self.entry = entry
    }

    public var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(snapshot: entry.snapshot)
        case .systemMedium:
            MediumWidgetView(snapshot: entry.snapshot)
        case .systemLarge:
            LargeWidgetView(snapshot: entry.snapshot)
        case .accessoryCircular:
            AccessoryCircularView(snapshot: entry.snapshot)
        case .accessoryRectangular:
            AccessoryRectangularView(snapshot: entry.snapshot)
        case .accessoryInline:
            AccessoryInlineView(snapshot: entry.snapshot)
        default:
            SmallWidgetView(snapshot: entry.snapshot)
        }
    }
}

// MARK: - Widget Declaration

public struct BFlowWidget: Widget {
    public static let kind: String = "BFlowWidget"

    public init() {}

    public var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: BFlowTimelineProvider()) { entry in
            if #available(iOSApplicationExtension 17.0, *) {
                BFlowWidgetEntryView(entry: entry)
                    .containerBackground(for: .widget) {
                        WidgetBackgroundView()
                    }
            } else {
                BFlowWidgetEntryView(entry: entry)
                    .background(WidgetBackgroundView())
            }
        }
        .configurationDisplayName("BFlow Presupuesto")
        .description("Flujo neto, checklist de gastos y resumen financiero en tiempo real.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline
        ])
    }
}
