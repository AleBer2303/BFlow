import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Tokens de la piel iOS
//
// Los colores salen de `palettes` (piel iOS) en `src/design-system/tokens.ts` y se generan como
// colorsets claro/oscuro desde `expo-target.config.js`. Las vistas nunca usan RGB sueltos.

enum WidgetPalette {
    static let background = Color("BFlowBackground")
    static let textPrimary = Color("BFlowTextPrimary")
    static let textSecondary = Color("BFlowTextSecondary")
    static let accent = Color("BFlowAccent")
    static let income = Color("BFlowIncome")
    static let expense = Color("BFlowExpense")
    static let pending = Color("BFlowPending")
    static let debt = Color("BFlowDebt")
    static let savings = Color("BFlowSavings")
    static let reserve = Color("BFlowReserve")
    static let completed = Color("BFlowCompleted")

    /// Pista de las barras de progreso: el texto secundario atenuado (sin color nuevo).
    static let track = Color("BFlowTextSecondary").opacity(0.22)

    /// Flujo: verde si ≥ 0, rojo si < 0. El signo y el símbolo repiten el significado.
    static func flow(_ amount: Int) -> Color {
        amount < 0 ? expense : income
    }
}

// MARK: - Deep links

enum WidgetDeepLink {
    case summary, checklist, debts, savings

    /// `bflow://?tab=<id>`; los ids coinciden con `WORKSPACE_TABS` de la app.
    var url: URL? {
        switch self {
        case .summary: return URL(string: "bflow://?tab=summary")
        case .checklist: return URL(string: "bflow://?tab=checklist")
        case .debts: return URL(string: "bflow://?tab=debts")
        case .savings: return URL(string: "bflow://?tab=savings")
        }
    }
}

// MARK: - Contenedor común

/// Raíz de cada widget: fondo de la piel, locale español, redacción del placeholder y estado
/// vacío. `content` solo se construye si hay snapshot.
struct WidgetRoot<Content: View>: View {
    let entry: BFlowEntry
    let link: WidgetDeepLink
    @ViewBuilder let content: (WidgetSnapshotV2) -> Content

    var body: some View {
        Group {
            if let snapshot = entry.snapshot {
                content(snapshot)
                    .redacted(reason: entry.isSample ? RedactionReasons.placeholder : RedactionReasons())
            } else {
                WidgetEmptyStateView()
            }
        }
        .environment(\.locale, Locale(identifier: "es_CO"))
        .widgetURL(link.url)
        .containerBackground(for: .widget) {
            WidgetPalette.background
        }
    }
}

/// Sin snapshot (sesión no iniciada o primera vez). Nunca muestra datos de ejemplo.
struct WidgetEmptyStateView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryInline:
            Label("Abre BFlow", systemImage: "chart.line.uptrend.xyaxis")
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.title3)
                    .widgetAccentable()
            }
            .accessibilityLabel("Abre BFlow para ver tu mes")
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text("BFlow")
                    .font(.headline)
                    .widgetAccentable()
                Text("Abre BFlow para ver tu mes")
                    .font(.caption)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(WidgetPalette.accent)
                    .widgetAccentable()
                Spacer(minLength: 0)
                Text("BFlow")
                    .font(.headline)
                    .foregroundStyle(WidgetPalette.textPrimary)
                Text("Abre BFlow para ver tu mes")
                    .font(.subheadline)
                    .foregroundStyle(WidgetPalette.textSecondary)
                    .lineLimit(3)
                    .minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .accessibilityElement(children: .combine)
        }
    }
}

// MARK: - Piezas reutilizables

/// Cabecera. Pequeños: título a la izquierda y mes a la derecha. Medianos y grandes
/// (`updatedAt` presente): "Título · Mes" a la izquierda y, a la derecha, cuándo se actualizó
/// y el botón discreto de actualizar.
struct WidgetHeader: View {
    let title: String
    let monthKey: String
    var updatedAt: Date? = nil
    var showsRefresh: Bool = false

    private var monthText: some View {
        Text(WidgetFormat.monthLabel(monthKey))
            .font(.caption2.weight(.semibold))
            .foregroundStyle(WidgetPalette.textSecondary)
            .lineLimit(1)
            .accessibilityLabel("Mes: \(WidgetFormat.monthLabel(monthKey))")
    }

    var body: some View {
        HStack(alignment: .center, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(WidgetPalette.textPrimary)
                .lineLimit(1)
            if let updatedAt {
                monthText
                Spacer(minLength: 4)
                WidgetUpdatedLabel(date: updatedAt)
            } else {
                Spacer(minLength: 4)
                monthText
            }
            if showsRefresh {
                WidgetRefreshButton()
            }
        }
        .frame(minHeight: 20)
    }
}

/// Botón interactivo (iOS 17+): ejecuta `RefreshWidgetIntent` y WidgetKit recarga el timeline.
struct WidgetRefreshButton: View {
    var body: some View {
        Button(intent: RefreshWidgetIntent()) {
            Image(systemName: "arrow.clockwise")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(WidgetPalette.textSecondary)
                .frame(width: 24, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Actualizar")
        .unredacted()
    }
}

/// "hace 3 min" (relativo y vivo: WidgetKit lo actualiza sin pedir timeline).
struct WidgetUpdatedLabel: View {
    let date: Date

    var body: some View {
        Text("hace \(date, style: .relative)")
            .font(.caption2)
            .foregroundStyle(WidgetPalette.textSecondary)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }
}

/// Cifra monetaria protagonista: dígitos tabulares, animación numérica y privacidad.
struct WidgetAmountText: View {
    let text: String
    let amount: Int
    let font: Font
    let color: Color
    var accentable: Bool = false

    var body: some View {
        Text(text)
            .font(font)
            .monospacedDigit()
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(0.55)
            .contentTransition(.numericText(value: Double(amount)))
            .privacySensitive()
            .widgetAccentable(accentable)
    }
}

/// Barra de progreso lineal con los tokens de la piel (sin `ProgressView`, que no admite pista).
struct WidgetProgressBar: View {
    let fraction: Double
    let tint: Color
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(WidgetPalette.track)
                Capsule()
                    .fill(tint)
                    .frame(width: barWidth(in: proxy.size.width))
                    .widgetAccentable()
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }

    private func barWidth(in totalWidth: CGFloat) -> CGFloat {
        let clamped = CGFloat(min(1, max(0, fraction)))
        let minimum: CGFloat = fraction > 0 ? height : 0
        return max(minimum, totalWidth * clamped)
    }
}

/// Fila "etiqueta · cifra" para métricas secundarias.
struct WidgetMetricRow: View {
    let symbol: String
    let label: String
    let amountText: String
    let amount: Int
    let color: Color
    let spokenLabel: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: symbol)
                .font(.caption2.weight(.bold))
                .foregroundStyle(color)
                .frame(width: 14)
            Text(label)
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
                .contentTransition(.numericText(value: Double(amount)))
                .privacySensitive()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenLabel)
    }
}

// MARK: - Atajos de formato ligados al snapshot

extension WidgetSnapshotV2 {
    func money(_ amount: Int) -> String {
        WidgetFormat.currency(amount, symbol: currencySymbol, separator: thousandsSeparator)
    }

    func signedMoney(_ amount: Int) -> String {
        WidgetFormat.signedCurrency(amount, symbol: currencySymbol, separator: thousandsSeparator)
    }

    func compactMoney(_ amount: Int) -> String {
        WidgetFormat.compactCurrency(amount, symbol: currencySymbol)
    }

    func signedCompactMoney(_ amount: Int) -> String {
        WidgetFormat.signedCompactCurrency(amount, symbol: currencySymbol)
    }

    func spoken(_ amount: Int) -> String {
        WidgetFormat.spokenAmount(amount, separator: thousandsSeparator)
    }

    var monthLabel: String { WidgetFormat.monthLabel(monthKey) }

    var checklistLabel: String { "\(checklistCompleted) de \(checklistTotal)" }

    var flowSymbol: String {
        netCashFlow < 0 ? "arrow.down.right" : "arrow.up.right"
    }
}
