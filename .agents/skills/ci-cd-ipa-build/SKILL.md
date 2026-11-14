---
name: ci-cd-ipa-build
description: >-
  Manages GitHub Actions workflows (ci.yml, build-ios.yml, e2e.yml) to run tests,
  compile the iOS app on macOS runners without paid Apple certificates, package
  an unsigned .ipa for iloader, and optimize macOS runner minutes.
---

# CI/CD & Unsigned `.ipa` Build (`ci-cd-ipa-build`)

## 1. Pipeline Deduplication & Caching (ADR 0029)
- **`ci.yml`:** runs on `push` (`main`, `develop`) and `pull_request` (`main`) with `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` and caches `.jest-cache` via `actions/cache@v4` before `npm test -- --coverage --ci`.
- **`build-ios.yml` & `build-android.yml`:**
  - Use `paths-ignore: ['docs/**', '*.md', '**/*.md']` on `push` so documentation-only commits do not consume build minutes.
  - Skip their internal `quality-gate` job when `github.event_name == 'push' && github.ref == 'refs/heads/main'` (already enforced by `ci.yml`) or when `inputs.skip_quality_gate` is `true` (`workflow_call` from `release.yml`). Still run `quality-gate` on `v*` tag pushes and `workflow_dispatch`.
  - Use `concurrency: { group: build-<platform>-${{ inputs.ref || github.ref }}, cancel-in-progress: true }` and cache `.jest-cache` in `quality-gate`.

## 2. Unsigned `.ipa` Packaging Recipe (`build-ios.yml`)
Because development happens on Windows 11 with a free Apple account:
1. Run on `macos-26` (selecting Xcode 26+ / Swift 6.2+).
2. Run `npx expo prebuild --platform ios --clean --no-install` (generates `ios/Podfile`, not `ios/Podfile.lock` because `/ios` is gitignored).
3. Cache `ios/Pods` + `~/Library/Caches/CocoaPods` with `key: ${{ runner.os }}-pods-${{ hashFiles('ios/Podfile', 'package-lock.json') }}`, and cache `~/Library/Caches/ccache` (`USE_CCACHE=1`, `CCACHE_DIR=$HOME/Library/Caches/ccache`, installing `ccache` via Homebrew if absent) before `npx pod-install --non-interactive`.
4. Build with code signing and index store disabled:
   ```bash
   xcodebuild build \
     -workspace ios/BFlow.xcworkspace \
     -scheme BFlow \
     -configuration Release \
     -sdk iphoneos \
     -destination "generic/platform=iOS" \
     -derivedDataPath build/DerivedData \
     CODE_SIGN_IDENTITY="" \
     CODE_SIGNING_REQUIRED=NO \
     CODE_SIGNING_ALLOWED=NO \
     AD_HOC_CODE_SIGNING_ALLOWED=YES \
     COMPILER_INDEX_STORE_ENABLE=NO
   ```
5. Package `Payload/` into `BFlow-unsigned.ipa`:
   ```bash
   mkdir -p build/Payload
   cp -R build/DerivedData/Build/Products/Release-iphoneos/BFlow.app build/Payload/
   cd build && zip -qry BFlow-unsigned.ipa Payload
   ```
6. Upload `BFlow-unsigned.ipa` as a workflow artifact and attach it to the GitHub Release (unless invoked via `workflow_call` with `inputs.ref` from `release.yml`).

## 3. Android Release Build Recipe (`build-android.yml`)
- Run `npx expo prebuild --platform android --clean --no-install` with `gradle/actions/setup-gradle@v4`.
- Build `.apk` and `.aab` in **one Gradle invocation** for physical ARM ABIs with build cache and parallel execution enabled:
  ```bash
  ./gradlew assembleRelease bundleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a,armeabi-v7a \
    -Dorg.gradle.caching=true \
    -Dorg.gradle.parallel=true
  ```
- Note: `e2e.yml` keeps `-PreactNativeArchitectures=${{ env.EMULATOR_ARCH }}` (`x86_64`) because it runs on the Linux Android emulator.
