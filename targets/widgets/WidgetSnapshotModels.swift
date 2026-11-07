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
            WidgetPendingItemV1(id: "seguro", name: "Póliza de Seguro", amountCop: 250_000, type: "expense"),
            WidgetPendingItemV1(id: "reserva", name: "Fondo de Reserva", amountCop: 100_000, type: "expense"),
            WidgetPendingItemV1(id: "servicios", name: "Servicios Básicos", amountCop: 100_000, type: "expense")
        ]
    )
    /// Dynamic empty fallback for current month before first app sync
    public static func emptyCurrentMonthFallback() -> WidgetSnapshotV1 {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM"
        formatter.timeZone = .current
        let currentMonthKey = formatter.string(from: Date())
        let isoFormatter = ISO8601DateFormatter()
        return WidgetSnapshotV1(
            schemaVersion: 1,
            updatedAtIso: isoFormatter.string(from: Date()),
            monthKey: currentMonthKey,
            netCashFlowCop: 0,
            receivedIncomeCop: 0,
            paidExpensesCop: 0,
            pendingExpensesCop: 0,
            checklistCompleted: 0,
            checklistTotal: 0,
            totalDebtCop: 0,
            openingDebtCop: 0,
            motoSavingsCop: 0,
            generalSavingsCop: 0,
            totalSavingsCop: 0,
            topPendingItems: []
        )
    }
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

    /// Candidate App Group suite names to handle dynamic bundle IDs, iloader, and canonical names
    public static func candidateSuiteNames() -> [String] {
        var suites: [String] = []
        let dynamic = resolveAppGroupId()
        suites.append(dynamic)
        if let bundleId = Bundle.main.bundleIdentifier {
            var parts = bundleId.components(separatedBy: ".")
            if parts.last == "widgets" {
                parts.removeLast()
                let parentGroup = "group.\(parts.joined(separator: "."))"
                if !suites.contains(parentGroup) {
                    suites.append(parentGroup)
                }
            }
            if parts.count >= 3 {
                let firstThree = parts.prefix(3).joined(separator: ".")
                let prefixGroup = "group.\(firstThree)"
                if !suites.contains(prefixGroup) {
                    suites.append(prefixGroup)
                }
            }
        }
        if !suites.contains("group.com.bflow.app") {
            suites.append("group.com.bflow.app")
        }
        return suites
    }

    /// Loads the latest snapshot written by React Native from shared App Group container file or UserDefaults
    public static func loadSnapshot() -> WidgetSnapshotV1 {
        let candidates = candidateSuiteNames()

        // 1. Check shared App Group container file first (atomic write bypasses cfprefsd caching)
        for suiteName in candidates {
            if let containerUrl = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: suiteName) {
                let fileUrl = containerUrl.appendingPathComponent("\(storageKey).json")
                if let fileData = try? Data(contentsOf: fileUrl),
                   let decoded = try? JSONDecoder().decode(WidgetSnapshotV1.self, from: fileData) {
                    return decoded
                }
            }
        }

        // 2. Check shared UserDefaults suites
        for suiteName in candidates {
            guard let defaults = UserDefaults(suiteName: suiteName) else {
                continue
            }
            defaults.synchronize()

            if let stringValue = defaults.string(forKey: storageKey),
               let data = stringValue.data(using: .utf8),
               let decoded = try? JSONDecoder().decode(WidgetSnapshotV1.self, from: data) {
                return decoded
            }

            if let data = defaults.data(forKey: storageKey),
               let decoded = try? JSONDecoder().decode(WidgetSnapshotV1.self, from: data) {
                return decoded
            }
        }

        // 3. Fallback to standard UserDefaults if shared container isn't isolated
        UserDefaults.standard.synchronize()
        if let stringValue = UserDefaults.standard.string(forKey: storageKey),
           let data = stringValue.data(using: .utf8),
           let decoded = try? JSONDecoder().decode(WidgetSnapshotV1.self, from: data) {
            return decoded
        }
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode(WidgetSnapshotV1.self, from: data) {
            return decoded
        }

        return .emptyCurrentMonthFallback()
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
