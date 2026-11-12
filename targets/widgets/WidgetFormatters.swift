import Foundation

// MARK: - Formato de dinero y meses
//
// Réplica exacta de `formatCurrency`, `formatCurrencyCompact` y `formatSignedCurrency`
// (`src/domain/money/money.ts`) y de `formatMonthKeyShortLabelEs` (`src/domain/date/monthKey.ts`).
// No depende del locale del dispositivo: símbolo y separador llegan en el snapshot.

public enum WidgetFormat {
    private static let monthShortNamesEs = [
        "Ene", "Feb", "Mar", "Abr", "May", "Jun",
        "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
    ]

    // MARK: Dinero

    /// "$ 1.080.000" o "-$ 1.080.000" (igual que `formatCurrency`).
    public static func currency(_ amount: Int, symbol: String, separator: String) -> String {
        let grouped = groupThousands(String(amount.magnitude), separator: separator)
        return amount < 0 ? "-\(symbol) \(grouped)" : "\(symbol) \(grouped)"
    }

    /// "+$ 120.000", "-$ 80.000", "$ 0" (igual que `formatSignedCurrency`).
    public static func signedCurrency(_ amount: Int, symbol: String, separator: String) -> String {
        let formatted = currency(amount, symbol: symbol, separator: separator)
        return amount > 0 ? "+\(formatted)" : formatted
    }

    /// "$ 1.1M", "$ 450k", "-$ 2B" (igual que `formatCurrencyCompact`).
    ///
    /// JS usa `toFixed`, que redondea según el valor binario exacto del cociente y, en un empate
    /// exacto, hacia arriba. `String(format:)` redondea los empates al par, así que aquí se
    /// redondea con aritmética entera y solo en el empate decimal se consulta el signo del
    /// residuo exacto (FMA) del cociente en `Double`, que es lo que decide `toFixed`.
    public static func compactCurrency(_ amount: Int, symbol: String) -> String {
        let abs = amount.magnitude
        let formatted: String
        if abs >= 1_000_000_000 {
            formatted = "\(symbol) \(oneDecimal(abs, unit: 1_000_000_000))B"
        } else if abs >= 1_000_000 {
            formatted = "\(symbol) \(oneDecimal(abs, unit: 1_000_000))M"
        } else if abs >= 1_000 {
            formatted = "\(symbol) \(roundedQuotient(abs, step: 1_000, unit: 1_000))k"
        } else {
            formatted = "\(symbol) \(abs)"
        }
        return amount < 0 ? "-\(formatted)" : formatted
    }

    /// Compacto con signo explícito para cifras de flujo: "+$ 1.1M", "-$ 450k", "$ 0".
    public static func signedCompactCurrency(_ amount: Int, symbol: String) -> String {
        let formatted = compactCurrency(amount, symbol: symbol)
        return amount > 0 ? "+\(formatted)" : formatted
    }

    /// Lectura para VoiceOver: "1.080.000 pesos" / "menos 1.080.000 pesos".
    public static func spokenAmount(_ amount: Int, separator: String) -> String {
        let grouped = groupThousands(String(amount.magnitude), separator: separator)
        return amount < 0 ? "menos \(grouped) pesos" : "\(grouped) pesos"
    }

    // MARK: Meses

    /// "Nov 2026" a partir de "2026-11".
    public static func monthLabel(_ monthKey: String) -> String {
        guard let parts = WidgetMonthKey.parts(monthKey) else { return monthKey }
        return "\(monthShortNamesEs[parts.month - 1]) \(parts.year)"
    }

    /// "Nov" a partir de "2026-11" (ejes de gráficos).
    public static func monthShortLabel(_ monthKey: String) -> String {
        guard let parts = WidgetMonthKey.parts(monthKey) else { return monthKey }
        return monthShortNamesEs[parts.month - 1]
    }

    /// Porcentaje entero para progreso: "23 %" se lee mal en widgets, se usa "23%".
    public static func percent(_ fraction: Double) -> String {
        let clamped = min(1, max(0, fraction))
        return "\(Int((clamped * 100).rounded(.down)))%"
    }

    // MARK: Internos

    private static func groupThousands(_ digits: String, separator: String) -> String {
        guard digits.count > 3 else { return digits }
        var result = ""
        let characters = Array(digits)
        for (index, character) in characters.enumerated() {
            let remaining = characters.count - index
            if index > 0 && remaining % 3 == 0 {
                result.append(separator)
            }
            result.append(character)
        }
        return result
    }

    /// `(abs / unit).toFixed(1).replace(/\.0$/, '')`
    private static func oneDecimal(_ abs: UInt, unit: UInt) -> String {
        let tenths = roundedQuotient(abs, step: unit / 10, unit: unit)
        let whole = tenths / 10
        let fraction = tenths % 10
        return fraction == 0 ? "\(whole)" : "\(whole).\(fraction)"
    }

    /// Redondea `abs / step` al entero más cercano con la regla de `toFixed` sobre `abs / unit`.
    private static func roundedQuotient(_ abs: UInt, step: UInt, unit: UInt) -> UInt {
        let quotient = abs / step
        let remainder = abs % step
        let half = step / 2
        if remainder > half { return quotient + 1 }
        if remainder < half { return quotient }
        // Empate decimal exacto (p. ej. 1.150.000 → 1.15): decide el valor binario de
        // `abs / unit`, como en JS. `addingProduct` es un FMA: `value * unit − abs` con un único
        // redondeo, así que su signo es el del error exacto. ≥ 0 → el Double está en o sobre el
        // empate y `toFixed` sube (1.25 → "1.3", 1.35 → "1.4"); < 0 → baja (1.15 → "1.1").
        let value = Double(abs) / Double(unit)
        let signedResidual = (-Double(abs)).addingProduct(value, Double(unit))
        return signedResidual >= 0 ? quotient + 1 : quotient
    }
}
