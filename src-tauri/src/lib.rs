#[cfg(desktop)]
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Schema migrations run natively, in order, inside a transaction, before the
/// WebView can touch the database. Never edit a shipped migration: add a new one.
fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_core_tables",
        kind: MigrationKind::Up,
        sql: r#"
            CREATE TABLE IF NOT EXISTS courses (
                id          TEXT PRIMARY KEY NOT NULL,
                name        TEXT NOT NULL,
                code        TEXT NOT NULL,
                instructor  TEXT,
                color       TEXT NOT NULL,
                schedule    TEXT NOT NULL DEFAULT '[]',
                term_start  TEXT,
                term_end    TEXT,
                skip_dates  TEXT NOT NULL DEFAULT '[]',
                archived    INTEGER NOT NULL DEFAULT 0,
                created_at  INTEGER NOT NULL,
                updated_at  INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS assessments (
                id          TEXT PRIMARY KEY NOT NULL,
                course_id   TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                title       TEXT NOT NULL,
                kind        TEXT NOT NULL,
                due_date    TEXT NOT NULL,
                due_time    TEXT,
                priority    TEXT NOT NULL DEFAULT 'medium',
                weight      REAL,
                status      TEXT NOT NULL DEFAULT 'todo',
                grade       REAL,
                notes       TEXT NOT NULL DEFAULT '',
                created_at  INTEGER NOT NULL,
                updated_at  INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_assessments_due    ON assessments(due_date);
            CREATE INDEX IF NOT EXISTS idx_assessments_course ON assessments(course_id);

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            );
        "#,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder
            // Must be registered first. A second launch (double-clicked shortcut,
            // taskbar pin) focuses the running window instead of opening another
            // copy that would write to the same database.
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }))
            // Reopens at the size and position you last left it.
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                // Must match DB_URL in src/storage/sqliteRepository.ts
                .add_migrations("sqlite:studyflow.db", migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running StudyFlow");
}
