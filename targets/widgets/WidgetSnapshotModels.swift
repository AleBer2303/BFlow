import Foundation

// MARK: - Contrato WidgetSnapshotV2 (ADR 0021)
//
// Espejo de `src/platform/widgets/widgetSnapshot.ts`. La app calcula el snapshot con el dominio
// y lo entrega ya resuelto; el widget solo lo pinta. Cualquier campo nuevo se añade en ambos
// lados en el mismo cambio. Todos los montos son enteros (nunca decimales).

public struct WidgetPendingItemV2: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let amount: Int
    /// "income" | "expense"
    public let type: String

    public var isIncome: Bool { type == "income" }
}

public struct WidgetTrendPointV2: Codable, Hashable, Sendable, Identifiable {
    public let monthKey: String
    public let receivedIncome: Int
    public let paidExpenses: Int
    public let netCashFlow: Int

    public var id: String { monthKey }
}

public struct WidgetSnapshotV2: Codable, Hashable, Sendable {
    public static let supportedSchemaVersion = 2

    public let schemaVersion: Int
    public let updatedAtIso: String
    public let monthKey: String
    public let currencySymbol: String
    public let thousandsSeparator: String
    public let plannedIncome: Int
    public let receivedIncome: Int
    public let pendingIncome: Int
    public let plannedExpenses: Int
    public let paidExpenses: Int
    public let pendingExpenses: Int
    public let netCashFlow: Int
    public let checklistCompleted: Int
    public let checklistTotal: Int
    public let totalDebt: Int
    public let initialDebt: Int
    public let debtSinceMonthKey: String?
    public let paidDebtThisMonth: Int
    public let estimatedPayoffMonthKey: String?
    public let reserveName: String
    public let reserveBalance: Int
    public let savingsName: String
    public let savingsBalance: Int
    public let otherSavingsBalance: Int
    public let totalSavings: Int
    public let pendingItems: [WidgetPendingItemV2]
    public let trend: [WidgetTrendPointV2]

    /// Fecha de `updatedAtIso`; `distantPast` si no se puede leer (pierde siempre al comparar).
    public var updatedAt: Date {
        WidgetDateParsing.parseIso8601(updatedAtIso) ?? .distantPast
    }

    /// Validación mínima del contrato (Zod ya validó en la app; esto protege ante payloads viejos).
    public var isValid: Bool {
        schemaVersion == Self.supportedSchemaVersion
            && WidgetDateParsing.parseIso8601(updatedAtIso) != nil
            && WidgetMonthKey.isValid(monthKey)
            && checklistCompleted >= 0
            && checklistTotal >= 0
            && checklistCompleted <= checklistTotal
            && !trend.isEmpty
            && trend.count <= 6
            && pendingItems.count <= 8
    }

    /// Progreso pagado de la deuda: (inicial − restante) / inicial, acotado a 0...1.
    public var debtPaidFraction: Double {
        guard initialDebt > 0 else { return 0 }
        let paid = max(0, initialDebt - totalDebt)
        return min(1, Double(paid) / Double(initialDebt))
    }

    /// Sin deudas registradas: no hay base de progreso ni saldo restante.
    public var hasNoDebts: Bool { initialDebt == 0 && totalDebt == 0 }

    public var checklistFraction: Double {
        guard checklistTotal > 0 else { return 0 }
        return min(1, Double(checklistCompleted) / Double(checklistTotal))
    }

    /// Decodifica un payload JSON (archivo del App Group o Firestore).
    /// Devuelve nil si no es V2 o no cumple el contrato: el widget lo trata como "sin datos".
    public static func decode(from data: Data) -> WidgetSnapshotV2? {
        guard let snapshot = try? JSONDecoder().decode(WidgetSnapshotV2.self, from: data),
              snapshot.isValid else {
            return nil
        }
        return snapshot
    }

    public static func decode(from string: String) -> WidgetSnapshotV2? {
        guard let data = string.data(using: .utf8) else { return nil }
        return decode(from: data)
    }

    /// El más reciente por fecha real (no por texto: los milisegundos son opcionales).
    public static func newest(_ a: WidgetSnapshotV2?, _ b: WidgetSnapshotV2?) -> WidgetSnapshotV2? {
        switch (a, b) {
        case let (lhs?, rhs?):
            return rhs.updatedAt > lhs.updatedAt ? rhs : lhs
        case let (lhs?, nil):
            return lhs
        case let (nil, rhs?):
            return rhs
        case (nil, nil):
            return nil
        }
    }
}

// MARK: - Credenciales del widget (WidgetAuthV1)

/// Credenciales mínimas para que el widget lea su propio documento
/// `users/{uid}/widgetSnapshots/current`. Las escribe la app al iniciar sesión y las borra al cerrarla.
public struct WidgetAuthV1: Codable, Hashable, Sendable {
    public let schemaVersion: Int
    public let uid: String
    public let refreshToken: String
    public let apiKey: String
    public let projectId: String

    public var isValid: Bool {
        schemaVersion == 1 && !uid.isEmpty && !refreshToken.isEmpty && !apiKey.isEmpty && !projectId.isEmpty
    }

    public func replacingRefreshToken(_ newToken: String) -> WidgetAuthV1 {
        WidgetAuthV1(schemaVersion: schemaVersion, uid: uid, refreshToken: newToken, apiKey: apiKey, projectId: projectId)
    }
}

// MARK: - Fechas y claves de mes

public enum WidgetDateParsing {
    /// ISO 8601 UTC con o sin milisegundos ("2026-11-11T14:03:22.512Z" o "2026-11-11T14:03:22Z").
    public static func parseIso8601(_ value: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: value) {
            return date
        }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: value)
    }
}

public enum WidgetMonthKey {
    /// Partes (año, mes 1...12) de un "YYYY-MM" válido.
    public static func parts(_ monthKey: String) -> (year: Int, month: Int)? {
        let pieces = monthKey.split(separator: "-", omittingEmptySubsequences: false)
        guard pieces.count == 2,
              pieces[0].count == 4, pieces[1].count == 2,
              let year = Int(pieces[0]), let month = Int(pieces[1]),
              (1...12).contains(month) else {
            return nil
        }
        return (year, month)
    }

    public static func isValid(_ monthKey: String) -> Bool {
        parts(monthKey) != nil
    }
}

// MARK: - Muestra solo para `placeholder` y la galería (nunca como dato real)

extension WidgetSnapshotV2 {
    /// Muestra con la forma del mes de referencia. Solo se pinta redactada
    /// (`.redacted(reason: .placeholder)`); jamás sustituye a un snapshot ausente.
    static let placeholderSample = WidgetSnapshotV2(
        schemaVersion: 2,
        updatedAtIso: "2026-10-29T12:00:00.000Z",
        monthKey: "2026-10",
        currencySymbol: "$",
        thousandsSeparator: ".",
        plannedIncome: 4_000_000,
        receivedIncome: 4_000_000,
        pendingIncome: 0,
        plannedExpenses: 3_370_000,
        paidExpenses: 2_920_000,
        pendingExpenses: 450_000,
        netCashFlow: 1_080_000,
        checklistCompleted: 6,
        checklistTotal: 12,
        totalDebt: 6_200_000,
        initialDebt: 8_000_000,
        debtSinceMonthKey: "2026-06",
        paidDebtThisMonth: 300_000,
        estimatedPayoffMonthKey: "2028-03",
        reserveName: "Reserva",
        reserveBalance: 2_300_000,
        savingsName: "Ahorro",
        savingsBalance: 2_080_000,
        otherSavingsBalance: 0,
        totalSavings: 4_380_000,
        pendingItems: [
            WidgetPendingItemV2(id: "sample_1", name: "Servicio pendiente", amount: 250_000, type: "expense"),
            WidgetPendingItemV2(id: "sample_2", name: "Aporte pendiente", amount: 100_000, type: "expense"),
            WidgetPendingItemV2(id: "sample_3", name: "Pago pendiente", amount: 100_000, type: "expense"),
        ],
        trend: [
            WidgetTrendPointV2(monthKey: "2026-08", receivedIncome: 3_800_000, paidExpenses: 3_100_000, netCashFlow: 700_000),
            WidgetTrendPointV2(monthKey: "2026-09", receivedIncome: 4_000_000, paidExpenses: 3_400_000, netCashFlow: 600_000),
            WidgetTrendPointV2(monthKey: "2026-10", receivedIncome: 4_000_000, paidExpenses: 2_920_000, netCashFlow: 1_080_000),
        ]
    )
}
