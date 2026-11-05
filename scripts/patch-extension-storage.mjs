/**
 * scripts/patch-extension-storage.mjs
 *
 * Ensures @bacons/apple-targets ExtensionStorageModule.swift writes WidgetSnapshotV1
 * both to shared App Group container files (containerURL(forSecurityApplicationGroupIdentifier:))
 * AND to UserDefaults(suiteName:) across dynamic iloader bundle IDs, then forces
 * WidgetCenter.shared.reloadAllTimelines().
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetFile = path.resolve(
  __dirname,
  '..',
  'node_modules',
  '@bacons',
  'apple-targets',
  'ios',
  'ExtensionStorageModule.swift'
);

const patchedSwiftSource = `import ExpoModulesCore
import Foundation
import WidgetKit

public class ExtensionStorageModule: Module {
    private static func candidateAppGroups(explicitGroup: String?) -> [String] {
        var groups: [String] = []
        if let bundleId = Bundle.main.bundleIdentifier, !bundleId.isEmpty {
            let cleanBase = bundleId.replacingOccurrences(of: ".widgets", with: "")
            let dynamicGroup = "group.\\(cleanBase)"
            groups.append(dynamicGroup)
        }
        if let explicitGroup = explicitGroup, !explicitGroup.isEmpty, !groups.contains(explicitGroup) {
            groups.append(explicitGroup)
        }
        if !groups.contains("group.com.bflow.app") {
            groups.append("group.com.bflow.app")
        }
        return groups
    }

    private static func writeSharedFile(key: String, data: Data, group: String) {
        guard let containerUrl = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
            return
        }
        let fileUrl = containerUrl.appendingPathComponent("\\(key).json")
        try? data.write(to: fileUrl, options: [.atomic])
    }

    public func definition() -> ModuleDefinition {
        Name("ExtensionStorage")

        Function("remove") { (forKey: String, suiteName: String?) in
            for suite in Self.candidateAppGroups(explicitGroup: suiteName) {
                let defaults = UserDefaults(suiteName: suite)
                defaults?.removeObject(forKey: forKey)
                defaults?.synchronize()
                if let containerUrl = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: suite) {
                    let fileUrl = containerUrl.appendingPathComponent("\\(forKey).json")
                    try? FileManager.default.removeItem(at: fileUrl)
                }
            }
            UserDefaults.standard.removeObject(forKey: forKey)
            UserDefaults.standard.synchronize()
        }

        Function("reloadWidget") { (timeline: String?) in
            if let timeline = timeline, !timeline.isEmpty {
                WidgetCenter.shared.reloadTimelines(ofKind: timeline)
            }
            WidgetCenter.shared.reloadAllTimelines()
        }

        Function("reloadControls") { (kind: String?) in
            if #available(iOS 18.0, *) {
                if let kind = kind {
                    ControlCenter.shared.reloadControls(ofKind: kind)
                } else {
                    ControlCenter.shared.reloadAllControls()
                }
            }
        }

        Function("setArray") { (forKey: String, data: [[String: Any]], suiteName: String?) -> Bool in
            do {
                let jsonData = try JSONSerialization.data(withJSONObject: data, options: [])
                for suite in Self.candidateAppGroups(explicitGroup: suiteName) {
                    let defaults = UserDefaults(suiteName: suite)
                    defaults?.set(jsonData, forKey: forKey)
                    defaults?.synchronize()
                    Self.writeSharedFile(key: forKey, data: jsonData, group: suite)
                }
                UserDefaults.standard.set(jsonData, forKey: forKey)
                UserDefaults.standard.synchronize()
                return true
            } catch {
                return false
            }
        }

        Function("setObject") { (forKey: String, data: [String: Any], suiteName: String?) -> Bool in
            do {
                let jsonData = try JSONSerialization.data(withJSONObject: data, options: [])
                for suite in Self.candidateAppGroups(explicitGroup: suiteName) {
                    let defaults = UserDefaults(suiteName: suite)
                    defaults?.set(jsonData, forKey: forKey)
                    defaults?.synchronize()
                    Self.writeSharedFile(key: forKey, data: jsonData, group: suite)
                }
                UserDefaults.standard.set(jsonData, forKey: forKey)
                UserDefaults.standard.synchronize()
                return true
            } catch {
                return false
            }
        }

        Function("setInt") { (key: String, value: Int, group: String?) in
            for suite in Self.candidateAppGroups(explicitGroup: group) {
                let userDefaults = UserDefaults(suiteName: suite)
                userDefaults?.set(value, forKey: key)
                userDefaults?.synchronize()
            }
            UserDefaults.standard.set(value, forKey: key)
            UserDefaults.standard.synchronize()
        }

        Function("setString") { (key: String, value: String, group: String?) in
            let utf8Data = value.data(using: .utf8)
            for suite in Self.candidateAppGroups(explicitGroup: group) {
                let userDefaults = UserDefaults(suiteName: suite)
                userDefaults?.set(value, forKey: key)
                userDefaults?.synchronize()
                if let utf8Data = utf8Data {
                    Self.writeSharedFile(key: key, data: utf8Data, group: suite)
                }
            }
            UserDefaults.standard.set(value, forKey: key)
            UserDefaults.standard.synchronize()
        }

        Function("get") { (key: String, group: String?) -> String? in
            for suite in Self.candidateAppGroups(explicitGroup: group) {
                if let containerUrl = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: suite) {
                    let fileUrl = containerUrl.appendingPathComponent("\\(key).json")
                    if let fileData = try? Data(contentsOf: fileUrl),
                       let str = String(data: fileData, encoding: .utf8) {
                        return str
                    }
                }
                let userDefaults = UserDefaults(suiteName: suite)
                if let data = userDefaults?.data(forKey: key) {
                    if let jsonObject = try? JSONSerialization.jsonObject(with: data, options: []),
                       let jsonData = try? JSONSerialization.data(withJSONObject: jsonObject, options: [.prettyPrinted]),
                       let str = String(data: jsonData, encoding: .utf8) {
                        return str
                    }
                }
                if let value = userDefaults?.object(forKey: key) {
                    return String(describing: value)
                }
            }
            return nil
        }
    }
}
`;

if (fs.existsSync(targetFile)) {
  fs.writeFileSync(targetFile, patchedSwiftSource, 'utf8');
  console.log('[patch-extension-storage] Patched ExtensionStorageModule.swift for real-time App Group file + UserDefaults sync.');
}
