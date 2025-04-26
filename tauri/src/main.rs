// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use db::{Database, Video};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};
use serde::{Deserialize, Serialize};

// State for holding the database connection
struct AppState {
    db: Arc<Mutex<Database>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VideoResponse {
    success: bool,
    message: String,
    data: Option<Vec<Video>>,
}

#[tauri::command]
fn open_external_link(window: tauri::Window, url: String) -> Result<(), String> {
    match window.shell_scope().open(&url, None) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_videos(app_state: State<'_, AppState>) -> Result<VideoResponse, String> {
    let db = app_state.db.lock().unwrap();
    match db.get_videos() {
        Ok(videos) => Ok(VideoResponse {
            success: true,
            message: "Videos retrieved successfully".to_string(),
            data: Some(videos),
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn add_video(video: Video, app_state: State<'_, AppState>) -> Result<VideoResponse, String> {
    let db = app_state.db.lock().unwrap();
    match db.add_video(&video) {
        Ok(_) => Ok(VideoResponse {
            success: true,
            message: "Video added successfully".to_string(),
            data: None,
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn update_video_status(id: i64, status: String, app_state: State<'_, AppState>) -> Result<VideoResponse, String> {
    let db = app_state.db.lock().unwrap();
    match db.update_video_status(id, &status) {
        Ok(_) => Ok(VideoResponse {
            success: true,
            message: "Video status updated successfully".to_string(),
            data: None,
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn update_video_path(id: i64, path: String, app_state: State<'_, AppState>) -> Result<VideoResponse, String> {
    let db = app_state.db.lock().unwrap();
    match db.update_video_path(id, &path) {
        Ok(_) => Ok(VideoResponse {
            success: true,
            message: "Video path updated successfully".to_string(),
            data: None,
        }),
        Err(e) => Err(e.to_string()),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_external_link,
            get_videos,
            add_video,
            update_video_status,
            update_video_path
        ])
        .setup(|app| {
            // Initialize database
            let db = Database::new(&app.handle()).expect("Failed to initialize database");
            // Store database in app state
            app.manage(AppState {
                db: Arc::new(Mutex::new(db)),
            });

            #[cfg(debug_assertions)]
            {
                let window = app.get_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
} 