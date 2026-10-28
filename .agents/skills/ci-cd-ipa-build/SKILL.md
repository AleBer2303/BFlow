---
name: ci-cd-ipa-build
description: >-
  Manages GitHub Actions workflows (ci.yml, build-ios.yml, e2e.yml) to run tests,
  compile the iOS app on macOS runners without paid Apple certificates, package
  an unsigned .ipa for iloader, and optimize macOS runner minutes.
---

# CI/CD & Unsigned `.ipa` Build (`ci-cd-ipa-build`)

## 1. Unsigned `.ipa` Packaging Recipe (`build-ios.yml`)
Because development happens on Windows 11 with a free Apple account:
1. Run on `macos-latest` **only after `ci.yml` passes** (or on `main` / version tags `v*`).
2. Use `concurrency: { group: build-ios-${{ github.ref }}, cancel-in-progress: true }` and cache `node_modules` + CocoaPods (`ios/Pods`) to minimize macOS minutes (10x multiplier on private repos; free on public repos).
3. Run `npx expo prebuild --platform ios --no-install` and `pod install --project-directory=ios`.
4. Archive with code signing disabled:
   ```bash
   xcodebuild archive \
     -workspace ios/BFlow.xcworkspace \
     -scheme BFlow \
     -configuration Release \
     -archivePath build/BFlow.xcarchive \
     -sdk iphoneos \
     CODE_SIGN_IDENTITY="" \
     CODE_SIGNING_REQUIRED=NO \
     CODE_SIGNING_ALLOWED=NO
   ```
5. Package `Payload/` into `BFlow-unsigned.ipa`:
   ```bash
   mkdir -p build/Payload
   cp -R build/BFlow.xcarchive/Products/Applications/BFlow.app build/Payload/
   cd build && zip -qry BFlow-unsigned.ipa Payload
   ```
6. Upload `BFlow-unsigned.ipa` as a workflow artifact and attach it to the GitHub Release for 1-click download and signing with `iloader`.
