import Foundation

// MARK: - Models

public struct WidgetPendingItemV1: Codable, Hashable {
    public let id: String
    public let name: String
    public let amountCop: Int
    public let type: String // "income" | "expense"

    public init(id: String, name: String, amountCop: Int, type: String) {
        self.id = id
        self.name = name
        self.amountCop = amountCop
        self.type = type
    }
}

public struct WidgetSnapshotV1: Codable, Hashable {
    public let schemaVersion: Int
    public let updatedAtIso: String
    public let monthKey: String
    public let netCashFlowCop: Int
    public let receivedIncomeCop: Int
    public let paidExpensesCop: Int
    public let pendingExpensesCop: Int
    public let checklistCompleted: Int
    public let checklistTotal: Int
    public let totalDebtCop: Int
    public let openingDebtCop: Int
    public let motoSavingsCop: Int
    public let generalSavingsCop: Int
    public let totalSavingsCop: Int
    public let topPendingItems: [WidgetPendingItemV1]

    public init(
        schemaVersion: Int,
        updatedAtIso: String,
        monthKey: String,
        netCashFlowCop: Int,
        receivedIncomeCop: Int,
        paidExpensesCop: Int,
        pendingExpensesCop: Int,
        checklistCompleted: Int,
        checklistTotal: Int,
        totalDebtCop: Int,
        openingDebtCop: Int,
        motoSavingsCop: Int,
        generalSavingsCop: Int,
        totalSavingsCop: Int,
        topPendingItems: [WidgetPendingItemV1]
    ) {
        self.schemaVersion = schemaVersion
        self.updatedAtIso = updatedAtIso
        self.monthKey = monthKey
        self.netCashFlowCop = netCashFlowCop
        self.receivedIncomeCop = receivedIncomeCop
        self.paidExpensesCop = paidExpensesCop
        self.pendingExpensesCop = pendingExpensesCop
        self.checklistCompleted = checklistCompleted
        self.checklistTotal = checklistTotal
        self.totalDebtCop = totalDebtCop
        self.openingDebtCop = openingDebtCop
        self.motoSavingsCop = motoSavingsCop
        self.generalSavingsCop = generalSavingsCop
        self.totalSavingsCop = totalSavingsCop
        self.topPendingItems = topPendingItems
    }

    /// Golden fallback matching fixtures/october-2026.json (Source of Truth)
    public static let goldenFallback: WidgetSnapshotV1 = WidgetSnapshotV1(
        schemaVersion: 1,
        updatedAtIso: "2026-10-29T12:00:00.000Z",
        monthKey: "2026-10",
        netCashFlowCop: 1_080_000,
        receivedIncomeCop: 4_000_000,
        paidExpensesCop: 2_920_000,
        pendingExpensesCop: 450_000,
        checklistCompleted: 6,
        checklistTotal: 12,
        totalDebtCop: 6_200_000,
        openingDebtCop: 8_000_000,
        motoSavingsCop: 2_300_000,
        generalSavingsCop: 2_080_000,
        totalSavingsCop: 4_380_000,
        topPendingItems: [
            WidgetPendingItemV1(id: "seguro-moto", name: "Seguro Todo Riesgo Moto", amountCop: 250_000, type: "expense"),
            WidgetPendingItemV1(id: "ahorro-moto", name: "Ahorro Moto", amountCop: 100_000, type: "expense"),
            WidgetPendingItemV1(id: "gasolina", name: "Gasolina y Peajes", amountCop: 100_000, type: "expense")
        ]
    )
}

// MARK: - App Group & Storage Bridge

public enum WidgetStorageBridge {
    public static let storageKey = "bflow_widget_snapshot_v1"

    /// Dynamically resolves the App Group from the bundle ID
    /// Handles iloader / custom sideloading team suffixes cleanly
    public static func resolveAppGroupId() -> String {
        let bundleId = Bundle.main.bundleIdentifier ?? "com.bflow.app.widgets"
        let base = bundleId.replacingOccurrences(of: ".widgets", with: "")
        return "group.\(base)"
    }

    /// Loads the latest snapshot written by React Native from shared UserDefaults
    public static func loadSnapshot() -> WidgetSnapshotV1 {
        let suiteName = resolveAppGroupId()
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            return .goldenFallback
        }

        // Try raw JSON data first (from ExtensionStorage setObject/setArray)
        if let data = defaults.data(forKey: storageKey) {
            if let decoded = try? JSONDecoder().decode(WidgetSnapshotV1.self, from: data) {
                return decoded
            }
        }

        // Try JSON string (from ExtensionStorage setString)
        if let stringValue = defaults.string(forKey: storageKey),
           let data = stringValue.data(using: .utf8) {
            if let decoded = try? JSONDecoder().decode(WidgetSnapshotV1.self, from: data) {
                return decoded
            }
        }

        return .goldenFallback
    }
}

// MARK: - Formatters

public enum WidgetFormatters {
    private static let copFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = "."
        return formatter
    }()

    public static func formatCop(_ amount: Int) -> String {
        let absAmount = abs(amount)
        let formatted = copFormatter.string(from: NSNumber(value: absAmount)) ?? "\(absAmount)"
        if amount < 0 {
            return "-$ \(formatted)"
        }
        return "$ \(formatted)"
    }

    public static func formatCopCompact(_ amount: Int) -> String {
        let absAmount = abs(amount)
        let sign = amount < 0 ? "-" : ""
        if absAmount >= 1_000_000 {
            let millions = Double(absAmount) / 1_000_000.0
            return String(format: "%@$%.2fM", sign, millions)
        } else if absAmount >= 1_000 {
            let thousands = Double(absAmount) / 1_000.0
            return String(format: "%@$%.0fk", sign, thousands)
        }
        return formatCop(amount)
    }

    public static func formatMonthLabel(_ monthKey: String) -> String {
        let parts = monthKey.split(separator: "-")
        guard parts.count == 2 else { return monthKey }
        let month = parts[1]
        let year = parts[0]
        let monthNames = [
            "01": "ENE", "02": "FEB", "03": "MAR", "04": "ABR",
            "05": "MAY", "06": "JUN", "07": "JUL", "08": "AGO",
            "09": "SEP", "10": "OCT", "11": "NOV", "12": "DIC"
        ]
        let name = monthNames[String(month)] ?? String(month)
        return "\(name) \(year)"
    }
}
