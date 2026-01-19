dev:
    npm run tauri dev

build:
    npm run tauri android build -- -d

# Use `-r` flag to reinstall keeping app data
install *args:
    adb install {{ args }} src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
