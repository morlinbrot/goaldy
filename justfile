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

del:
    rm -f ~/Library/Application\ Support/app.goaldy.budget/goaldy.db && echo "Database deleted successfully"

clear:
    !#/bin/bash
    rm -rf dist node_modules/.vite && \
    cd src-tauri/gen/android && ./gradlew clean && cd ../../.. && \
    adb uninstall app.goaldy.budget; \
    npm run tauri android build -- --target aarch64 --debug

sb-link:
    supabase link --project-ref ajyomlfpzdoohnudgwfg

sb-deploy: sb-link
    supabase functions deploy

encode private_key:
    echo -n {{ private_key }} | base64
