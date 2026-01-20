default:
    just -l -u

set dotenv-path := ".env.local"

dev:
    npm run tauri dev

build:
    npm run tauri android build -- -d

alias i := install

# Use `-r` flag to reinstall keeping app data
install *args:
    adb install {{ args }} src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

db:
    supabase db push --db-url $DATABASE_URL
