// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use db::{Database, QueueItem, AppSettings};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

// State for holding the database connection
struct AppState {
    db: Arc<Mutex<Database>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Response<T> {
    success: bool,
    message: String,
    data: Option<T>,
}

#[tauri::command]
fn open_external_link(window: tauri::Window, url: String) -> Result<(), String> {
    match window.shell_scope().open(&url, None) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_queue_items(app_state: State<'_, AppState>) -> Result<Response<Vec<QueueItem>>, String> {
    let db = app_state.db.lock().unwrap();
    match db.get_queue_items() {
        Ok(items) => Ok(Response {
            success: true,
            message: "Queue items retrieved successfully".to_string(),
            data: Some(items),
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn add_queue_item(item: QueueItem, app_state: State<'_, AppState>) -> Result<Response<String>, String> {
    let db = app_state.db.lock().unwrap();
    match db.add_queue_item(&item) {
        Ok(id) => Ok(Response {
            success: true,
            message: "Item added to queue successfully".to_string(),
            data: Some(id),
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn update_queue_item(item: QueueItem, app_state: State<'_, AppState>) -> Result<Response<()>, String> {
    let db = app_state.db.lock().unwrap();
    match db.update_queue_item(&item) {
        Ok(_) => Ok(Response {
            success: true,
            message: "Queue item updated successfully".to_string(),
            data: None,
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn update_item_status(id: String, status: String, message: Option<String>, app_state: State<'_, AppState>) -> Result<Response<()>, String> {
    let db = app_state.db.lock().unwrap();
    match db.update_item_status(&id, &status, message) {
        Ok(_) => Ok(Response {
            success: true,
            message: "Status updated successfully".to_string(),
            data: None,
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn clear_completed_items(status_types: Vec<String>, app_state: State<'_, AppState>) -> Result<Response<()>, String> {
    let db = app_state.db.lock().unwrap();
    match db.clear_items_by_status(&status_types) {
        Ok(_) => Ok(Response {
            success: true,
            message: "Items cleared successfully".to_string(),
            data: None,
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_settings(app_state: State<'_, AppState>) -> Result<Response<AppSettings>, String> {
    let db = app_state.db.lock().unwrap();
    match db.get_settings() {
        Ok(settings) => Ok(Response {
            success: true,
            message: "Settings retrieved successfully".to_string(),
            data: Some(settings),
        }),
        Err(e) => {
            // Log the error but return empty settings instead of failing
            eprintln!("Error retrieving settings: {}", e);
            Ok(Response {
                success: true,
                message: "Settings table empty or not found, using defaults".to_string(),
                data: Some(AppSettings {
                    filemoon_api_key: None,
                    files_vc_api_key: None,
                    download_directory: None,
                    delete_after_upload: None,
                    auto_upload: None,
                    upload_target: None,
                }),
            })
        }
    }
}

#[tauri::command]
async fn save_settings(settings: AppSettings, app_state: State<'_, AppState>) -> Result<Response<()>, String> {
    let db = app_state.db.lock().unwrap();
    match db.save_settings(&settings) {
        Ok(_) => Ok(Response {
            success: true,
            message: "Settings saved successfully".to_string(),
            data: None,
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_download_directory() -> Result<Response<String>, String> {
    match dirs::download_dir() {
        Some(dir) => Ok(Response {
            success: true,
            message: "Download directory retrieved successfully".to_string(),
            data: Some(dir.to_string_lossy().to_string()),
        }),
        None => Err("Could not determine download directory".to_string()),
    }
}

#[tauri::command]
async fn create_directory(path: String) -> Result<Response<()>, String> {
    match fs::create_dir_all(&path) {
        Ok(_) => Ok(Response {
            success: true,
            message: format!("Directory created at: {}", path),
            data: None,
        }),
        Err(e) => Err(format!("Failed to create directory: {}", e)),
    }
}

#[tauri::command]
async fn import_from_file(path: String, app_state: State<'_, AppState>) -> Result<Response<()>, String> {
    // Check if file exists
    if !Path::new(&path).exists() {
        return Err(format!("File does not exist: {}", path));
    }
    
    // Try to import data
    let db = app_state.db.lock().unwrap();
    match db.manual_import_from_path(&path) {
        Ok(_) => Ok(Response {
            success: true,
            message: format!("Successfully imported data from {}", path),
            data: None,
        }),
        Err(e) => Err(format!("Failed to import data: {}", e)),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_external_link,
            get_queue_items,
            add_queue_item,
            update_queue_item,
            update_item_status,
            clear_completed_items,
            get_settings,
            save_settings,
            get_download_directory,
            create_directory,
            import_from_file
        ])
        .setup(|app| {
            // Copy database from app directory if it exists
            if let Ok(app_dir) = std::env::current_dir() {
                let source_db = app_dir.join("permavid_local.sqlite");
                if source_db.exists() {
                    let target_dir = app.path_resolver().app_data_dir().expect("Failed to get app data directory");
                    if !target_dir.exists() {
                        std::fs::create_dir_all(&target_dir).expect("Failed to create app data directory");
                    }
                    let target_db = target_dir.join("permavid_local.sqlite");
                    
                    // Only copy if target doesn't exist yet
                    if !target_db.exists() {
                        println!("Found database in application directory, copying to app data directory");
                        if let Err(e) = fs::copy(&source_db, &target_db) {
                            println!("Failed to copy database: {}", e);
                        } else {
                            println!("Successfully copied database to app data directory");
                        }
                    }
                }
            }
            
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