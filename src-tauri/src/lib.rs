// Goaldy Tauri Application
//
// Database migrations are now handled by the TypeScript migration runner
// in src/lib/migrations.ts, which reads from supabase/migrations/ as the
// single source of truth for both local SQLite and remote Supabase schemas.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                // No migrations here - they are handled by TypeScript
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
