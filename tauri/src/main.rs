// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use db::{Database, QueueItem, AppSettings};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use reqwest::multipart;
use tokio::fs::File;
use tokio_util::codec::{BytesCodec, FramedRead};
use futures_util::stream::TryStreamExt;
use bytes::Bytes;

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

#[derive(Debug, Serialize, Deserialize)]
struct FilemoonUploadResponse {
    status: u16,
    msg: String,
    result: Option<FilemoonUploadResult>,
}

#[derive(Debug, Serialize, Deserialize)]
struct FilemoonUploadResult {
    files: Option<Vec<FilemoonFile>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct FilemoonFile {
    filecode: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct FilesVcUploadResponse {
    status: u16,
    msg: String,
    result: Option<FilesVcUploadResult>,
}

#[derive(Debug, Serialize, Deserialize)]
struct FilesVcUploadResult {
    file_code: String,
    url: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct FilemoonRestartResponse {
    status: u16,
    msg: String,
    // Add other fields if the API returns more data
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
    if !Path::new(&path).exists() {
        return Err(format!("File does not exist: {}", path));
    }
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

#[tauri::command]
async fn retry_item(id: String, app_state: State<'_, AppState>) -> Result<Response<()>, String> {
    let db = app_state.db.lock().unwrap();
    let item_result = db.get_item_by_id(&id);
    match item_result {
        Ok(Some(item)) => {
            if item.status == "failed" && item.filemoon_url.is_none() && item.files_vc_url.is_none() {
                match db.update_item_status(&id, "queued", Some("Retrying...".to_string())) {
                    Ok(_) => Ok(Response {
                        success: true,
                        message: "Item re-queued for processing.".to_string(),
                        data: None,
                    }),
                    Err(e) => Err(format!("Database error updating status: {}", e)),
                }
            } else {
                Err(format!("Item is not in a retryable failed state (status: {}, has_upload_url: {}).",
                         item.status,
                         item.filemoon_url.is_some() || item.files_vc_url.is_some()))
            }
        }
        Ok(None) => Err(format!("Retry failed: Item {} not found.", id)),
        Err(e) => Err(format!("Database error retrieving item: {}", e)),
    }
}

// --- ADDED: Command to cancel an item ---
#[tauri::command]
async fn cancel_item(id: String, app_state: State<'_, AppState>) -> Result<Response<()>, String> {
    let db = app_state.db.lock().unwrap();
    match db.get_item_by_id(&id) {
        Ok(Some(_)) => {
            match db.update_item_status(&id, "cancelled", Some("Cancelled by user".to_string())) {
                Ok(_) => Ok(Response {
                    success: true,
                    message: "Item cancelled successfully".to_string(),
                    data: None,
                }),
                Err(e) => Err(format!("Database error updating status to cancelled: {}", e)),
            }
        }
        Ok(None) => Err(format!("Cancel failed: Item {} not found.", id)),
        Err(e) => Err(format!("Database error checking item existence: {}", e)),
    }
}
// --- END ADDED Command ---

// --- ADDED: Command to restart Filemoon encoding ---
#[tauri::command]
#[tokio::main]
async fn restart_encoding(id: String, app_state: State<'_, AppState>) -> Result<Response<()>, String> {
    let db_lock = app_state.db.lock().unwrap();

    // 1. Get item details (need filemoon_url which contains filecode)
    let item = match db_lock.get_item_by_id(&id) {
        Ok(Some(i)) => i,
        Ok(None) => return Err(format!("Restart encoding failed: Item {} not found.", id)),
        Err(e) => return Err(format!("DB Error getting item for restart: {}", e)),
    };

    let filecode = match item.filemoon_url {
        Some(fc) if !fc.is_empty() => fc,
        _ => { 
            let err_msg = format!("Restart encoding failed: Filemoon filecode not found for item.");
            return Err(err_msg); 
        }
    };

    // 2. Get settings (need Filemoon API key)
    let settings = match db_lock.get_settings() {
        Ok(s) => s,
        Err(e) => return Err(format!("Failed to get settings for restart: {}", e)),
    };

    let api_key = match settings.filemoon_api_key {
        Some(key) if !key.is_empty() => key,
        _ => return Err("Restart encoding failed: Filemoon API key not configured".to_string()),
    };
    
    // Release DB lock before async HTTP call
    drop(db_lock); 

    // 3. Call Filemoon Restart API
    println!("Attempting to restart encoding for filecode: {}", filecode);
    let client = reqwest::Client::new();
    let params = [("key", &api_key), ("file_code", &filecode)];

    match client.post("https://api.filemoon.sx/api/upload/restart")
        .form(&params)
        .send()
        .await {
        Ok(response) => {
            let status = response.status();
            match response.json::<FilemoonRestartResponse>().await {
                Ok(resp_body) => {
                    if status.is_success() && resp_body.status == 200 {
                        println!("Filemoon restart encoding request successful for {}", filecode);
                        // Update item status back to encoding (or maybe uploading?)
                        let db_lock_after = app_state.db.lock().unwrap();
                        let _ = db_lock_after.update_item_status(&id, "encoding", Some("Restarted encoding".to_string()));
                        // Optionally clear encoding progress if applicable
                        // let mut updated_item = db_lock_after.get_item_by_id(&id).map_err(|e| format!("DB Error: {}", e))?.unwrap();
                        // updated_item.encoding_progress = Some(0);
                        // let _ = db_lock_after.update_queue_item(&updated_item);

                        Ok(Response {
                            success: true,
                            message: format!("Successfully requested encoding restart for filecode {}", filecode),
                            data: None,
                        })
                    } else {
                        let err_msg = format!("Filemoon restart API Error (Status {}): {}", resp_body.status, resp_body.msg);
                        println!("{}", err_msg);
                        // Maybe update status to failed with this message?
                         let db_lock_after = app_state.db.lock().unwrap();
                         let _ = db_lock_after.update_item_status(&id, "failed", Some(err_msg.clone()));
                        Err(err_msg)
                    }
                }
                Err(e) => {
                    let err_msg = format!("Failed to parse Filemoon restart response: {}", e);
                    println!("{}", err_msg);
                    Err(err_msg)
                }
            }
        }
        Err(e) => {
            let err_msg = format!("Filemoon restart request failed: {}", e);
            println!("{}", err_msg);
            Err(err_msg)
        }
    }
}
// --- END ADDED Command ---

#[tauri::command]
#[tokio::main]
async fn trigger_upload(id: String, app_state: State<'_, AppState>) -> Result<Response<String>, String> {
    let db = app_state.db.lock().unwrap();
    let item = match db.get_item_by_id(&id) {
        Ok(Some(item)) => item,
        Ok(None) => return Err(format!("Upload failed: Item {} not found.", id)),
        Err(e) => return Err(format!("Database error retrieving item: {}", e)),
    };
    let settings = match db.get_settings() {
        Ok(settings) => settings,
        Err(e) => return Err(format!("Failed to retrieve settings: {}", e)),
    };
    if item.status != "completed" && item.status != "encoded" {
        return Err(format!("Item {} is not in a completed state (status: {}). Cannot upload.", id, item.status));
    }
    let local_path_str = match &item.local_path {
        Some(p) => p.clone(),
        None => { 
            let err_msg = format!("Upload failed: Local file path not found for item.");
            return Err(err_msg); 
        }
    };
    let local_path = Path::new(&local_path_str);
    if !local_path.exists() {
        let _ = db.update_item_status(&id, "failed", Some(format!("Local file not found at: {}", local_path_str)));
        return Err(format!("Upload failed: Local file does not exist at {}", local_path_str));
    }
    let filename = local_path.file_name().and_then(|n| n.to_str()).unwrap_or("unknown_file").to_string();
    if let Err(e) = db.update_item_status(&id, "uploading", Some("Starting upload...".to_string())) {
        return Err(format!("Failed to update item status to uploading: {}", e));
    }
    drop(db);

    let upload_target = settings.upload_target.clone().unwrap_or_else(|| "filemoon".to_string());
    let mut final_message = "Upload status unknown".to_string();
    let mut success = false;
    let client = reqwest::Client::new();

    if upload_target == "filemoon" || upload_target == "both" {
        let api_key = match settings.filemoon_api_key.clone() {
            Some(key) if !key.is_empty() => key,
            _ => {
                let db_lock = app_state.db.lock().unwrap();
                let _ = db_lock.update_item_status(&id, "failed", Some("Filemoon API key not configured".to_string()));
                return Err("Filemoon API key not configured".to_string());
            }
        };
        println!("Attempting to upload {} to Filemoon...", filename);
        let file = match File::open(&local_path).await {
            Ok(f) => f,
            Err(e) => {
                 let db_lock = app_state.db.lock().unwrap();
                 let _ = db_lock.update_item_status(&id, "failed", Some(format!("Failed to open file: {}", e)));
                 return Err(format!("Failed to open file: {}", e));
            }
        };
        let stream = FramedRead::new(file, BytesCodec::new());
        let file_body = reqwest::Body::wrap_stream(stream.map_ok(Bytes::from));
        let form = multipart::Form::new()
            .text("key", api_key)
            .part("file", multipart::Part::stream(file_body).file_name(filename.clone()));
        match client.post("https://api.filemoon.sx/api/upload/server").multipart(form).send().await {
            Ok(response) => {
                let status = response.status();
                match response.json::<FilemoonUploadResponse>().await {
                    Ok(resp_body) => {
                        if status.is_success() && resp_body.status == 200 && resp_body.result.as_ref().and_then(|r| r.files.as_ref()).map_or(false, |f| !f.is_empty()) {
                            let filecode = resp_body.result.unwrap().files.unwrap().remove(0).filecode;
                            println!("Filemoon upload successful! Filecode: {}", filecode);
                            let db_lock = app_state.db.lock().unwrap();
                            let _ = db_lock.update_item_status(&id, "uploaded", Some(format!("Filemoon: {}", filecode)));
                            let mut updated_item = db_lock.get_item_by_id(&id).map_err(|e| format!("DB Error: {}", e))?.unwrap();
                            updated_item.filemoon_url = Some(filecode.clone());
                            if let Err(e) = db_lock.update_queue_item(&updated_item) { eprintln!("Failed to update Filemoon URL in DB: {}", e); }
                            final_message = format!("Upload to Filemoon successful (Filecode: {}).", filecode);
                            success = true;
                        } else {
                             let err_msg = format!("Filemoon API Error (Status {}): {}", resp_body.status, resp_body.msg);
                             println!("{}", err_msg);
                             let db_lock = app_state.db.lock().unwrap();
                             let _ = db_lock.update_item_status(&id, "failed", Some(err_msg.clone()));
                             final_message = err_msg;
                             success = false;
                        }
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to parse Filemoon response: {}", e);
                        println!("{}", err_msg);
                        let db_lock = app_state.db.lock().unwrap();
                        let _ = db_lock.update_item_status(&id, "failed", Some(err_msg.clone()));
                        final_message = err_msg;
                        success = false;
                    }
                }
            }
            Err(e) => {
                let err_msg = format!("Filemoon request failed: {}", e);
                println!("{}", err_msg);
                let db_lock = app_state.db.lock().unwrap();
                let _ = db_lock.update_item_status(&id, "failed", Some(err_msg.clone()));
                final_message = err_msg;
                success = false;
            }
        }
    }

    if upload_target == "files_vc" || (upload_target == "both" && !success) {
        let api_key = match settings.files_vc_api_key.clone() {
            Some(key) if !key.is_empty() => key,
            _ => {
                let db_lock = app_state.db.lock().unwrap();
                let _ = db_lock.update_item_status(&id, "failed", Some("Files.vc API key not configured".to_string()));
                return Err("Files.vc API key not configured".to_string());
            }
        };
        println!("Attempting to upload {} to Files.vc...", filename);
        let file = match File::open(&local_path).await {
            Ok(f) => f,
            Err(e) => {
                 let db_lock = app_state.db.lock().unwrap();
                 let _ = db_lock.update_item_status(&id, "failed", Some(format!("Failed to open file: {}", e)));
                 return Err(format!("Failed to open file: {}", e));
            }
        };
        let stream = FramedRead::new(file, BytesCodec::new());
        let file_body = reqwest::Body::wrap_stream(stream.map_ok(Bytes::from));
        let form = multipart::Form::new()
            .text("key", api_key)
            .part("file", multipart::Part::stream(file_body).file_name(filename));
        match client.post("https://api.files.vc/upload").multipart(form).send().await {
             Ok(response) => {
                let status = response.status();
                 match response.json::<FilesVcUploadResponse>().await {
                    Ok(resp_body) => {
                        if status.is_success() && resp_body.status == 200 && resp_body.result.is_some() {
                            let result_data = resp_body.result.unwrap();
                            let file_url = result_data.url;
                            println!("Files.vc upload successful! URL: {}", file_url);
                            let db_lock = app_state.db.lock().unwrap();
                             let _ = db_lock.update_item_status(&id, "uploaded", Some(format!("Files.vc: {}", file_url)));
                             let mut updated_item = db_lock.get_item_by_id(&id).map_err(|e| format!("DB Error: {}", e))?.unwrap();
                             updated_item.files_vc_url = Some(file_url.clone());
                             if let Err(e) = db_lock.update_queue_item(&updated_item) { eprintln!("Failed to update Files.vc URL in DB: {}", e); }
                            final_message = format!("Upload to Files.vc successful (URL: {}).", file_url);
                            success = true;
                         } else {
                             let err_msg = format!("Files.vc API Error (Status {}): {}", resp_body.status, resp_body.msg);
                             println!("{}", err_msg);
                             let db_lock = app_state.db.lock().unwrap();
                             let _ = db_lock.update_item_status(&id, "failed", Some(err_msg.clone()));
                             final_message = err_msg;
                             success = false;
                         }
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to parse Files.vc response: {}", e);
                        println!("{}", err_msg);
                        let db_lock = app_state.db.lock().unwrap();
                        let _ = db_lock.update_item_status(&id, "failed", Some(err_msg.clone()));
                        final_message = err_msg;
                        success = false;
                    }
                 }
            }
            Err(e) => {
                 let err_msg = format!("Files.vc request failed: {}", e);
                 println!("{}", err_msg);
                 let db_lock = app_state.db.lock().unwrap();
                 let _ = db_lock.update_item_status(&id, "failed", Some(err_msg.clone()));
                 final_message = err_msg;
                 success = false;
            }
        }
    }

    if success {
        if settings.delete_after_upload.unwrap_or_else(|| "false".to_string()) == "true" {
             match fs::remove_file(&local_path) {
                 Ok(_) => println!("Successfully deleted local file: {}", local_path_str),
                 Err(e) => eprintln!("Failed to delete local file {}: {}", local_path_str, e),
             }
        }
        Ok(Response { success: true, message: final_message, data: Some(id) })
    } else {
        Err(final_message)
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
            import_from_file,
            retry_item,
            trigger_upload,
            cancel_item,
            restart_encoding
        ])
        .setup(|app| {
            if let Ok(app_dir) = std::env::current_dir() {
                let source_db = app_dir.join("permavid_local.sqlite");
                if source_db.exists() {
                    let target_dir = app.path_resolver().app_data_dir().expect("Failed to get app data directory");
                    if !target_dir.exists() {
                        std::fs::create_dir_all(&target_dir).expect("Failed to create app data directory");
                    }
                    let target_db = target_dir.join("permavid_local.sqlite");
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
            let db = Database::new(&app.handle()).expect("Failed to initialize database");
            app.manage(AppState { db: Arc::new(Mutex::new(db)) });
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