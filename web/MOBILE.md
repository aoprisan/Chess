# Mobile apps (Android + iOS)

The same PWA ships as a native Android and iOS app through
[Capacitor](https://capacitorjs.com/). The native project is a thin WebView
shell around the exact `dist/` bundle the web build produces — engine, AI and
campaign already run fully client-side, so the app needs no network access, no
backend and no extra permissions.

Everything is built **locally** with the scripts in `scripts/mobile/`. There is
deliberately **no CI workflow** for the mobile builds: store uploads need
signing material that doesn't belong in this repo.

## TL;DR

```bash
cd web
npm install

npm run android:build     # debug APK   -> dist-mobile/android/app-debug.apk
npm run android:run       # build, install and launch on a device/emulator
npm run android:release   # release AAB -> dist-mobile/android/app-release.aab

npm run ios:build         # simulator build -> dist-mobile/ios/App.app   (macOS)
npm run ios:run           # build, install and launch on a device/simulator
npm run ios:release       # .xcarchive + .ipa -> dist-mobile/ios/        (macOS)
```

The first run of either script scaffolds the native project (`npx cap add`),
which takes a few seconds; later runs just re-sync the web assets.

## Prerequisites

|           | Android                                                                      | iOS                                  |
| --------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| OS        | macOS, Linux or Windows (Git Bash/WSL)                                       | macOS only                           |
| Toolchain | JDK 21 + Android SDK (Android Studio, or `cmdline-tools` + `platform-tools`) | Xcode 16+ with command line tools    |
| Also      | `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) exported                              | CocoaPods (`brew install cocoapods`) |

`npm run cap:doctor` prints what Capacitor can and can't find.

## How the native build differs from the web build

`npm run build` targets GitHub Pages: base path `/Chess/`, plus a service
worker for offline support. Neither fits a WebView, so the mobile scripts use
`npm run build:mobile`, which sets two env vars read by `vite.config.ts`:

- `BASE_PATH=/` — inside the WebView the bundle is served from the origin root
  (`capacitor://localhost/` on iOS, `https://localhost/` on Android).
- `CAPACITOR=1` — disables `vite-plugin-pwa`. The assets are already on the
  device; a service worker would only risk pinning a stale build across app
  updates. `virtual:pwa-register` still resolves as a no-op, so `main.tsx`
  needs no branch.

App id, display name, WebView background colour and the rest live in
`capacitor.config.ts`.

## The build scripts

Both scripts take the same shape: build the web bundle → scaffold the platform
if missing → `cap sync` → build. Run either with `--help` for the full list.

```bash
bash scripts/mobile/build-android.sh [--release] [--apk|--bundle] [--open] [--run] [--target <id>] [--skip-web] [--clean]
bash scripts/mobile/build-ios.sh     [--release] [--simulator|--device] [--archive] [--ipa] [--open] [--run] [--target <id>] [--skip-web] [--clean]
```

Useful flags:

- `--open` hands off to Android Studio / Xcode after syncing — the easiest way
  to debug native issues or manage signing by hand.
- `--skip-web` reuses the existing `dist/`, for when you're iterating on native
  config rather than game code.
- `--target <id>` picks a device; list them with `npx cap run android --list`
  (or `ios`).

Artifacts always land in `web/dist-mobile/`.

The app version comes from `web/package.json` — `version: "1.4.2"` becomes
version name `1.4.2` and version code / build number `10402`. Bump the version
there, not in the native projects. Set `MOBILE_BUILD_NUMBER` to override the
build number when a store rejects a duplicate upload.

## Signing

### Android

Create a keystore once (keep it out of the repo):

```bash
keytool -genkey -v -keystore ~/keys/neon-city.jks -alias neon-city \
        -keyalg RSA -keysize 2048 -validity 10000
```

Then export these before a release build; the script forwards them to Gradle as
injected signing properties (the same mechanism Android Studio uses), so the
generated `build.gradle` needs no edits:

```bash
export ANDROID_KEYSTORE_PATH=~/keys/neon-city.jks
export ANDROID_KEYSTORE_PASSWORD=...
export ANDROID_KEY_ALIAS=neon-city
export ANDROID_KEY_PASSWORD=...
npm run android:release        # -> dist-mobile/android/app-release.aab
```

Without them the release build still succeeds but the artifact is **unsigned**
and can't be installed or uploaded (the script warns). Passwords are masked in
the echoed Gradle command.

### iOS

Signing is Xcode's job. Set your team id and let Xcode manage provisioning:

```bash
export IOS_DEVELOPMENT_TEAM=AB12CD34EF
export IOS_EXPORT_METHOD=app-store-connect   # or development (default), ad-hoc, enterprise
npm run ios:release                          # -> dist-mobile/ios/App.ipa
```

The script writes an `ExportOptions.plist` for you; point
`IOS_EXPORT_OPTIONS_PLIST` at your own if you need finer control. Simulator
builds (`npm run ios:build`) skip code signing entirely, so they work without
an Apple Developer account.

## Live reload on a device

Run the dev server with the native base path and LAN binding, then point the
app at it:

```bash
npm run dev:mobile                                              # terminal 1
CAP_SERVER_URL=http://192.168.1.20:5173/ npm run android:run    # terminal 2
```

Use the machine's LAN IP, not `localhost` — the phone has to reach it. Rebuild
without `CAP_SERVER_URL` to go back to the bundled assets.

## Icons and splash screens

`npm run mobile:assets` renders the neon logo into `resources/` (icon 1024²,
adaptive-icon foreground/background, splash 2732² light + dark) and then fans
those out into every Android density bucket and the iOS asset catalog. Re-run it
after regenerating a native project, or after changing the logo in
`scripts/generate-mobile-assets.mjs`.

## What's in git and what isn't

`android/`, `ios/`, `dist-mobile/` and `node_modules/` are ignored: they're all
generated. The sources of truth are `capacitor.config.ts`, the scripts in
`scripts/mobile/`, and `resources/`.

That means **don't hand-edit files under `android/` or `ios/`** — the next
`npm run mobile:clean && rm -rf android ios` throws them away. It also means a
Capacitor upgrade is just:

```bash
npm install @capacitor/core@latest @capacitor/cli@latest @capacitor/android@latest @capacitor/ios@latest
rm -rf android ios
npm run android:build && npm run mobile:assets
```

If the app ever needs something the WebView can't do (haptics, sharing, store
reviews), install the matching `@capacitor/*` plugin — `cap sync` wires it into
both platforms automatically, and no native code needs to be committed.

## Troubleshooting

- **`SDK location not found`** — export `ANDROID_HOME` (macOS:
  `~/Library/Android/sdk`, Linux: `~/Android/Sdk`).
- **`pod: command not found`** — `brew install cocoapods`, then re-run.
- **White screen on launch** — almost always a base-path problem. Confirm the
  build ran through `npm run build:mobile` (a `/Chess/`-based bundle can't
  resolve its assets in a WebView) and that `android/app/src/main/assets/public`
  contains a fresh `index.html`.
- **Old build keeps showing up** — `npm run mobile:clean`, then rebuild;
  `--skip-web` reuses whatever is in `dist/`.
