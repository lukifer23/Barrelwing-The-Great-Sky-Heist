# Android development

The Android app packages the production Vite output in a Capacitor WebView. All runtime assets ship in the APK. It does not load a development server or download game code while playing.

## Build prerequisites

- Node.js 22.12 or newer, npm, JDK 21.
- Android SDK Platform 36, Build Tools 36, platform-tools.
- A USB-debugging-enabled device, or an Android emulator.

Set `JAVA_HOME` to the JDK's home directory and `ANDROID_HOME` to the Android SDK directory. On macOS, `scripts/android.mjs` locates JDK 21 through `java_home` and uses the standard Android SDK location when these variables are absent. Machine-specific SDK paths stay in ignored `android/local.properties`.

```sh
npm ci
npm run android:apk
npm run android:install
```

If multiple devices are connected, set `ANDROID_SERIAL` to the intended device before installing. The install script uses `adb install -r` to update in place and then starts the app.

Package ID: `com.barrelwing.skyheist`. Build type: debug. Minimum Android API: 24. Target API: 36. The checked-in Gradle wrapper controls the Gradle version.

## Display and controls

The activity is resizable, uses hardware acceleration, and handles screen size, orientation, screen layout, and density changes without recreating the WebView for ordinary fold transitions. It does not lock orientation. System bars hide during play and can be revealed with an edge swipe.

The renderer explicitly uses WebGL. Its backing resolution follows logical world units, keeping the GPU workload modest while preserving pixel-art rendering. Camera size expands with the available aspect ratio. Physics velocities stay in world units. Menus retain a centered layout. The analog thumb joystick and action buttons have independent physical hit areas and multi-pointer input.

Portrait touch layouts reserve space below the canvas. Landscape controls overlay the lower corners. Button size, opacity, handedness, and haptics are configurable. Insets account for system bars and cutouts where exposed by WebView.

## Lifecycle and persistence

Backgrounding pauses campaign gameplay and saves a checkpoint snapshot. Android Back routes through scene navigation. Native Preferences holds a durable save copy; browser storage acts as a local journal and fallback. Upgrade and record changes are saved immediately, and active runs autosave periodically and at checkpoints, pauses, and page hide.

An update signed with the same certificate preserves the app's data. Uninstalling or clearing storage deletes saves. Keep the development signing key if future personal APKs should update this installation in place. Never commit keystores.

## Diagnostics

Debug builds allow WebView debugging. Use Chrome's `chrome://inspect` while the USB-connected app is open. The debug game object is available as `window.__game` for inspection. Turn on the FPS display in Settings for a quick indicator.

The build requires OpenGL ES 2.0 support. Hardware acceleration and WebGL enable GPU rendering; they do not by themselves guarantee 60 fps. Validate sustained frame times during gameplay, boss encounters, and fold/rotation transitions on the target device. Headless desktop timings are not a substitute for device measurements.

## Foldable acceptance checks

1. Launch on the outer display and play with movement plus jump held together.
2. Unfold during gameplay; confirm the same score, lives, position, and checkpoint remain.
3. Rotate both displays; verify HUD, touch areas, and menu navigation remain usable.
4. Background and return; the campaign should be paused with no stuck movement.
5. Force-stop and relaunch; Continue should restore the checkpoint and collected progress.
6. Repeat in the boss stage and Sky Sprint; inspect frame pacing and thermal behavior.

A simulated browser resize checks layout logic. Only a physical fold tests the device's actual display handoff behavior.
