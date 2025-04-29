// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Ensure db module is included
mod db;

use db::{Database, QueueItem, AppSettings};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Manager, State};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use reqwest::multipart;
use tokio::fs::File;
use tokio::time::sleep;
use tokio_util::codec::{BytesCodec, FramedRead};
use futures_util::stream::TryStreamExt;
use bytes::Bytes;
use std::process::Stdio;
use tokio::process::Command;
use tokio::io::{BufReader, AsyncBufReadExt};
use regex::Regex;
use lazy_static::lazy_static;
use serde_json::Value as JsonValue;

lazy_static! {
    // Regex to capture download percentage from yt-dlp output
    static ref YTDLP_PROGRESS_REGEX: Regex = Regex::new(r"\[download\]\s+(\d{1,3}(?:\.\d+)?)%").unwrap();
}

// Helper function to sanitize filenames
fn sanitize_filename(name: &str) -> String {
    // Basic sanitization: replace invalid chars with underscores
    // This might need to be more robust depending on expected titles
    name.chars().map(|c| {
        match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ if c.is_control() => '_',
            _ => c,
        }
    }).collect::<String>()
    // Trim leading/trailing whitespace/dots/underscores and limit length
    .trim_matches(|c: char| c.is_whitespace() || c == '.' || c == '_')
    .chars().take(200).collect()
}

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

#[derive(Debug, Deserialize, Serialize)]
struct FilemoonUploadResponse {
    status: u16,
    msg: String,
    files: Option<Vec<FilemoonFile>>,
}

#[derive(Debug, Deserialize, Serialize)]
struct FilemoonFile {
    filecode: String,
    filename: Option<String>,
    status: Option<String>,
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

#[derive(Debug, Serialize, Deserialize)]
struct FilemoonEncodingStatusResponse {
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
        Ok(id) => {
            // After adding, immediately signal the background task (if possible)
            // Or rely on its periodic check
            Ok(Response {
                success: true,
                message: "Item added to queue successfully".to_string(),
                data: Some(id),
            })
        },
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
async fn restart_encoding(id: String, app_state: State<'_, AppState>) -> Result<Response<()>, String> {
    let filecode: String;
    let api_key: String;
    let item_id_clone = id.clone(); // Clone id for potential use after drop

    // Scope to get data from DB and drop lock
    {
        let db_lock = app_state.db.lock().unwrap();
        let item = match db_lock.get_item_by_id(&id) {
            Ok(Some(i)) => i,
            Ok(None) => return Err(format!("Restart encoding failed: Item {} not found.", id)),
            Err(e) => return Err(format!("DB Error getting item for restart: {}", e)),
        };

        filecode = match item.filemoon_url {
            Some(fc) if !fc.is_empty() => fc,
            _ => return Err(format!("Restart encoding failed: Filemoon filecode not found for item.")),
        };

        let settings = match db_lock.get_settings() {
            Ok(s) => s,
            Err(e) => return Err(format!("Failed to get settings for restart: {}", e)),
        };

        api_key = match settings.filemoon_api_key {
            Some(key) if !key.is_empty() => key,
            _ => return Err("Restart encoding failed: Filemoon API key not configured".to_string()),
        };
        // db_lock is dropped here
    }

    // Perform HTTP request outside of DB lock scope
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
                        // Re-acquire lock to update status
                        {
                            let db_lock_after = app_state.db.lock().unwrap();
                            let _ = db_lock_after.update_item_status(&item_id_clone, "encoding", Some("Restarted encoding".to_string()));
                            // db_lock_after dropped here
                        }
                        Ok(Response {
                            success: true,
                            message: format!("Successfully requested encoding restart for filecode {}", filecode),
                            data: None,
                        })
                    } else {
                        let err_msg = format!("Filemoon restart API Error (Status {}): {}", resp_body.status, resp_body.msg);
                        println!("{}", err_msg);
                        // Re-acquire lock to update status to failed
                        {
                            let db_lock_after = app_state.db.lock().unwrap();
                            let _ = db_lock_after.update_item_status(&item_id_clone, "failed", Some(err_msg.clone()));
                             // db_lock_after dropped here
                        }
                        Err(err_msg)
                    }
                }
                Err(e) => {
                    let err_msg = format!("Failed to parse Filemoon restart response: {}", e);
                    println!("{}", err_msg);
                     // Attempt to update status to failed even on parse error
                     {
                        let db_lock_after = app_state.db.lock().unwrap();
                        let _ = db_lock_after.update_item_status(&item_id_clone, "failed", Some(format!("Parse Error: {}", e)));
                        // db_lock_after dropped here
                    }
                    Err(err_msg)
                }
            }
        }
        Err(e) => {
            let err_msg = format!("Filemoon restart request failed: {}", e);
            println!("{}", err_msg);
            // Attempt to update status to failed on request error
            {
                let db_lock_after = app_state.db.lock().unwrap();
                let _ = db_lock_after.update_item_status(&item_id_clone, "failed", Some(format!("Request Error: {}", e)));
                // db_lock_after dropped here
            }
            Err(err_msg)
        }
    }
}
// --- END ADDED Command ---

// --- ADDED: Command to get gallery items ---
#[tauri::command]
async fn get_gallery_items(app_state: State<'_, AppState>) -> Result<Response<Vec<QueueItem>>, String> {
    let db = app_state.db.lock().unwrap();
    match (*db).get_gallery_items() {
        Ok(items) => Ok(Response {
            success: true,
            message: "Gallery items retrieved successfully".to_string(),
            data: Some(items),
        }),
        Err(e) => Err(format!("Database error getting gallery items: {}", e)),
    }
}
// --- END ADDED Command ---

#[tauri::command]
async fn trigger_upload(id: String, app_state: State<'_, AppState>) -> Result<Response<String>, String> {
    let local_path_str: String;
    let filename: String;
    let upload_target: String;
    let settings_clone: AppSettings; // Clone settings to use outside lock
    let item_id_clone = id.clone(); // Clone id

    // Scope 1: Get initial data and mark as uploading
    {
        let db = app_state.db.lock().unwrap();
        let item = match db.get_item_by_id(&id) {
            Ok(Some(item)) => item,
            Ok(None) => return Err(format!("Upload failed: Item {} not found.", id)),
            Err(e) => return Err(format!("Database error retrieving item: {}", e)),
        };

        settings_clone = match db.get_settings() {
            Ok(settings) => settings,
            Err(e) => return Err(format!("Failed to retrieve settings: {}", e)),
        };

        if item.status != "completed" && item.status != "encoded" {
            return Err(format!("Item {} is not in a completed state (status: {}). Cannot upload.", id, item.status));
        }

        local_path_str = match &item.local_path {
            Some(p) => p.clone(),
            None => return Err(format!("Upload failed: Local file path not found for item.")),
        };

        let local_path_check = Path::new(&local_path_str); // Need Path for filename
         filename = local_path_check.file_name().and_then(|n| n.to_str()).unwrap_or("unknown_file").to_string();

        if let Err(e) = db.update_item_status(&id, "uploading", Some("Starting upload...".to_string())) {
            return Err(format!("Failed to update item status to uploading: {}", e));
        }
        
        upload_target = settings_clone.upload_target.clone().unwrap_or_else(|| "filemoon".to_string());
        // db lock dropped here
    }

    // Check file existence outside lock
    let local_path = Path::new(&local_path_str);
     if !local_path.exists() {
        // Re-acquire lock to update status
        {
             let db_err = app_state.db.lock().unwrap();
             let _ = db_err.update_item_status(&item_id_clone, "failed", Some(format!("Local file not found at: {}", local_path_str)));
        }
        return Err(format!("Upload failed: Local file does not exist at {}", local_path_str));
    }

    // Perform uploads outside lock
    let mut final_message = "Upload status unknown".to_string();
    let mut success = false;
    let client = reqwest::Client::new();

    // --- Filemoon Upload Logic --- 
    if upload_target == "filemoon" || upload_target == "both" {
        let api_key = match settings_clone.filemoon_api_key.clone() {
            Some(key) if !key.is_empty() => key,
            _ => {
                 // Re-acquire lock to update status
                 {
                     let db_err = app_state.db.lock().unwrap();
                     let _ = db_err.update_item_status(&item_id_clone, "failed", Some("Filemoon API key not configured".to_string()));
                 }
                return Err("Filemoon API key not configured".to_string());
            }
        };
        println!("Attempting to upload {} to Filemoon...", filename);
        
        // File open needs to be async
        let file = match File::open(&local_path).await {
            Ok(f) => f,
            Err(e) => {
                // Re-acquire lock to update status
                 {
                     let db_err = app_state.db.lock().unwrap();
                     let _ = db_err.update_item_status(&item_id_clone, "failed", Some(format!("Failed to open file: {}", e)));
                 }
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
                        if status.is_success() && resp_body.status == 200 && resp_body.files.as_ref().map_or(false, |f| !f.is_empty()) {
                            let filecode = resp_body.files.unwrap().remove(0).filecode;
                            println!("Filemoon upload successful! Filecode: {}", filecode);
                            // Re-acquire lock to update status
                            {
                                let db_lock = app_state.db.lock().unwrap();
                                let _ = db_lock.update_item_status(&item_id_clone, "uploaded", Some(format!("Filemoon: {}", filecode)));
                                let mut updated_item = db_lock.get_item_by_id(&item_id_clone).map_err(|e| format!("DB Error: {}", e))?.unwrap();
                                updated_item.filemoon_url = Some(filecode.clone());
                                if let Err(e) = db_lock.update_queue_item(&updated_item) { eprintln!("Failed to update Filemoon URL in DB: {}", e); }
                            }
                            final_message = format!("Upload to Filemoon successful (Filecode: {}).", filecode);
                            success = true;
                        } else {
                            let err_msg = format!("Filemoon API Error (Status {}): {}", resp_body.status, resp_body.msg);
                            println!("{}", err_msg);
                             // Re-acquire lock to update status
                            {
                                 let db_lock = app_state.db.lock().unwrap();
                                 let _ = db_lock.update_item_status(&item_id_clone, "failed", Some(err_msg.clone()));
                            }
                             final_message = err_msg;
                        }
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to parse Filemoon response: {}", e);
                        println!("{}", err_msg);
                         // Re-acquire lock to update status
                         {
                            let db_lock = app_state.db.lock().unwrap();
                            let _ = db_lock.update_item_status(&item_id_clone, "failed", Some(err_msg.clone()));
                         }
                        final_message = err_msg;
                    }
                }
            }
            Err(e) => {
                let err_msg = format!("Filemoon request failed: {}", e);
                println!("{}", err_msg);
                 // Re-acquire lock to update status
                 {
                    let db_lock = app_state.db.lock().unwrap();
                    let _ = db_lock.update_item_status(&item_id_clone, "failed", Some(err_msg.clone()));
                 }
                final_message = err_msg;
            }
        }
    }

    // --- Files.vc Upload Logic --- 
    if upload_target == "files_vc" || (upload_target == "both" && !success) {
        let api_key = match settings_clone.files_vc_api_key.clone() {
            Some(key) if !key.is_empty() => key,
            _ => {
                 // Re-acquire lock to update status
                 {
                     let db_lock = app_state.db.lock().unwrap();
                     let _ = db_lock.update_item_status(&item_id_clone, "failed", Some("Files.vc API key not configured".to_string()));
                 }
                return Err("Files.vc API key not configured".to_string());
            }
        };
        println!("Attempting to upload {} to Files.vc...", filename);
        
        // File open needs to be async
        let file = match File::open(&local_path).await {
            Ok(f) => f,
            Err(e) => {
                 // Re-acquire lock to update status
                 {
                     let db_lock = app_state.db.lock().unwrap();
                     let _ = db_lock.update_item_status(&item_id_clone, "failed", Some(format!("Failed to open file: {}", e)));
                 }
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
                             // Re-acquire lock to update status
                             {
                                 let db_lock = app_state.db.lock().unwrap();
                                 let _ = db_lock.update_item_status(&item_id_clone, "uploaded", Some(format!("Files.vc: {}", file_url)));
                                 let mut updated_item = db_lock.get_item_by_id(&item_id_clone).map_err(|e| format!("DB Error: {}", e))?.unwrap();
                                 updated_item.files_vc_url = Some(file_url.clone());
                                 if let Err(e) = db_lock.update_queue_item(&updated_item) { eprintln!("Failed to update Files.vc URL in DB: {}", e); }
                             }
                            final_message = format!("Upload to Files.vc successful (URL: {}).", file_url);
                            success = true;
                         } else {
                             let err_msg = format!("Files.vc API Error (Status {}): {}", resp_body.status, resp_body.msg);
                             println!("{}", err_msg);
                              // Re-acquire lock to update status
                             {
                                 let db_lock = app_state.db.lock().unwrap();
                                 let _ = db_lock.update_item_status(&item_id_clone, "failed", Some(err_msg.clone()));
                             }
                             final_message = err_msg;
                         }
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to parse Files.vc response: {}", e);
                        println!("{}", err_msg);
                         // Re-acquire lock to update status
                         {
                             let db_lock = app_state.db.lock().unwrap();
                             let _ = db_lock.update_item_status(&item_id_clone, "failed", Some(err_msg.clone()));
                         }
                        final_message = err_msg;
                    }
                 }
            }
            Err(e) => {
                 let err_msg = format!("Files.vc request failed: {}", e);
                 println!("{}", err_msg);
                  // Re-acquire lock to update status
                 {
                     let db_lock = app_state.db.lock().unwrap();
                     let _ = db_lock.update_item_status(&item_id_clone, "failed", Some(err_msg.clone()));
                 }
                 final_message = err_msg;
            }
        }
    }

    // Final result handling (delete file if needed)
    if success {
        if settings_clone.delete_after_upload.unwrap_or_else(|| "false".to_string()) == "true" {
             match fs::remove_file(&local_path) {
                 Ok(_) => println!("Successfully deleted local file: {}", local_path_str),
                 Err(e) => eprintln!("Failed to delete local file {}: {}", local_path_str, e),
             }
        }
        Ok(Response { success: true, message: final_message, data: Some(item_id_clone) })
    } else {
        // If all uploads failed, the last error message is in final_message
        // The status would have been set to failed within the respective upload blocks
        Err(final_message)
    }
}

// --- Background Queue Processing ---

async fn process_queue_background(app_handle: tauri::AppHandle) {
    println!("Starting background queue processor...");
    loop {
        let mut item_to_process: Option<QueueItem> = None;
        let mut should_sleep_long = true; // Sleep longer if no item found or error

        {
            // --- Start of DB Lock Scope 1 --- 
            let app_state: State<'_, AppState> = app_handle.state();
            let db_lock = app_state.db.lock().unwrap();

            let is_already_processing = match (*db_lock).is_item_in_status(&["downloading", "uploading"]) {
                Ok(processing) => processing,
                Err(e) => {
                    eprintln!("DB Error checking for active processing: {}", e);
                    false 
                }
            };

            if !is_already_processing {
                match (*db_lock).get_next_queued_item() {
                    Ok(Some(item)) => {
                        item_to_process = Some(item);
                        should_sleep_long = false; // Found item, process immediately
                    },
                    Ok(None) => { /* No items, sleep long */ },
                    Err(e) => {
                        eprintln!("DB Error fetching next queued item: {}", e);
                         /* Error, sleep long */ 
                    }
                }
            }
            // --- db_lock is dropped here at the end of the scope ---
        }

        // --- Process Item (if found) outside the main DB lock scope ---
        if let Some(next_item) = item_to_process {
            let item_id = next_item.id.clone().unwrap_or_default();
            let item_url = next_item.url.clone();
            println!("Processing queue item: ID={}, URL={}", item_id, item_url);

            let download_dir: String;
            let mut proceed_with_download = true; // Assume true initially

            {
                 // --- Start of DB Lock Scope 2 (Settings & Mark Downloading) ---
                let app_state: State<'_, AppState> = app_handle.state();
                let db_lock = app_state.db.lock().unwrap();

                let settings = match (*db_lock).get_settings() {
                    Ok(s) => s,
                    Err(e) => {
                        eprintln!("Error getting settings for item {}: {}", item_id, e);
                        let _ = (*db_lock).update_item_status(&item_id, "failed", Some(format!("Failed to get settings: {}", e)));
                        AppSettings::default() // Return default to avoid breaking flow, but log error
                    }
                };

                let download_dir_setting = settings.download_directory;
                download_dir = match download_dir_setting {
                    Some(dir) if !dir.is_empty() => dir,
                    _ => {
                         match dirs::download_dir() {
                             Some(dir) => dir.to_string_lossy().to_string(),
                             None => {
                                 let err_msg = "Download directory not set and default couldn't be determined.".to_string();
                                 eprintln!("Error for item {}: {}", item_id, err_msg);
                                 let _ = (*db_lock).update_item_status(&item_id, "failed", Some(err_msg));
                                 String::new() // Return empty string, check later
                             }
                         }
                    }
                };

                if download_dir.is_empty() {
                     proceed_with_download = false;
                } else if let Err(e) = fs::create_dir_all(&download_dir) {
                     let err_msg = format!("Failed to create download directory '{}': {}", download_dir, e);
                     eprintln!("Error for item {}: {}", item_id, err_msg);
                     let _ = (*db_lock).update_item_status(&item_id, "failed", Some(err_msg));
                     proceed_with_download = false;
                } else if let Err(e) = (*db_lock).update_item_status(&item_id, "downloading", Some("Download starting...".to_string())) {
                     eprintln!("Error marking item {} as downloading: {}", item_id, e);
                     proceed_with_download = false; // Failed to update status, don't proceed
                } 
                // --- db_lock is dropped here ---
            }

            // --- Execute Download (if safe to proceed) --- 
            if proceed_with_download { // Check the flag
                println!("Starting yt-dlp download for item: {}...", item_id);
                
                // --- yt-dlp Command Construction ---
                // Use yt-dlp's output template feature for naming
                let output_template = format!("%(title)s by %(channel)s.%(ext)s"); 
                let output_path_base = Path::new(&download_dir); // Just the directory
                // output_path_str will contain the directory and the template string
                let output_path_str = output_path_base.join(&output_template).to_string_lossy().to_string();

                let ytdlp_path = "yt-dlp"; // Assuming yt-dlp is in PATH. Consider making this configurable.

                let mut cmd = Command::new(ytdlp_path);
                cmd.arg(&item_url); // The URL to download
                cmd.arg("--write-info-json"); // Get metadata (still useful even if not parsed immediately)
                cmd.arg("--output"); // Specify output template
                cmd.arg(&output_path_str); // Pass the full path template
                cmd.arg("--no-simulate"); // Ensure it actually downloads
                cmd.arg("--progress"); // Request progress updates
                cmd.arg("--newline"); // Ensure progress updates are on new lines
                cmd.arg("--no-warnings"); // Reduce noise in output
                // Consider adding --format bestvideo+bestaudio/best if needed

                cmd.stdout(Stdio::piped()); // Capture standard output
                cmd.stderr(Stdio::piped()); // Capture standard error
                
                // --- Run yt-dlp Process ---
                let mut final_status = "failed"; // Assume failure initially
                let mut final_message = Some("Download failed (Unknown error)".to_string());
                let mut download_success = false;

                match cmd.spawn() {
                    Ok(mut child) => {
                        let stdout = child.stdout.take().expect("Failed to capture stdout");
                        let stderr = child.stderr.take().expect("Failed to capture stderr");

                        let mut stdout_reader = BufReader::new(stdout).lines();
                        let mut stderr_reader = BufReader::new(stderr).lines();

                        // Clone necessary data for the async blocks
                        let item_id_clone_stdout = item_id.clone();
                        let app_handle_clone_stdout = app_handle.clone();

                        // Spawn task to read stdout and parse progress
                        tokio::spawn(async move {
                            while let Ok(Some(line)) = stdout_reader.next_line().await {
                                // println!("[yt-dlp stdout] {}", line); // Optional: keep for debugging

                                // Check for progress
                                if let Some(caps) = YTDLP_PROGRESS_REGEX.captures(&line) {
                                    if let Some(percent_match) = caps.get(1) {
                                        if let Ok(percent) = percent_match.as_str().parse::<f32>() {
                                            let progress_message = format!("Downloading: {:.1}%", percent);
                                            // Update DB status (briefly lock)
                                            {
                                                let state: State<'_, AppState> = app_handle_clone_stdout.state();
                                                let db_lock = state.db.lock().unwrap();
                                                let _ = db_lock.update_item_status(&item_id_clone_stdout, "downloading", Some(progress_message));
                                            }
                                        }
                                    }
                                }
                                // REMOVE: Logic to check for destination filename
                            }
                        });

                        // Spawn task to read stderr
                        tokio::spawn(async move {
                             let mut err_output = String::new();
                             while let Ok(Some(line)) = stderr_reader.next_line().await {
                                 println!("[yt-dlp stderr] {}", line);
                                 err_output.push_str(&line);
                                 err_output.push('\n');
                             }
                             // TODO: Use err_output if download fails
                        });

                        match child.wait().await {
                            Ok(status) => {
                                if status.success() {
                                    println!("yt-dlp process finished successfully for item: {}", item_id);
                                    download_success = true;
                                    final_status = "completed";
                                    final_message = Some("Download complete".to_string()); // Simpler message now
                                } else {
                                    let err_msg = format!("yt-dlp exited with error code: {:?}", status.code());
                                    eprintln!("Error for item {}: {}", item_id, err_msg);
                                    final_message = Some(err_msg);
                                }
                            }
                            Err(e) => {
                                let err_msg = format!("Failed to wait for yt-dlp process: {}", e);
                                eprintln!("Error for item {}: {}", item_id, err_msg);
                                final_message = Some(err_msg);
                            }
                        }
                    }
                    Err(e) => {
                         let err_msg = format!("Failed to spawn yt-dlp command: {}. Is yt-dlp installed and in PATH?", e);
                         eprintln!("Error for item {}: {}", item_id, err_msg);
                         final_message = Some(err_msg);
                    }
                }
                // --- END yt-dlp Process ---

                // --- After download attempt ---
                {
                     let app_state: State<'_, AppState> = app_handle.state();
                     let db_lock_after = app_state.db.lock().unwrap();

                     if download_success {
                        // --- Read info.json to get actual file details --- 
                        let mut actual_video_path: Option<String> = None;
                        let mut video_title: Option<String> = None;
                        let mut thumbnail_url: Option<String> = None;
                        let mut processed_json = false; // Flag to indicate if we successfully processed a JSON

                        println!("Download successful for {}. Searching for .info.json in dir: {}", item_id, download_dir);

                        // Search for *any* .info.json file and try to process it
                        if let Ok(entries) = fs::read_dir(&download_dir) {
                            for entry in entries.filter_map(Result::ok) {
                                let path = entry.path();
                                // Check if it's a .info.json file
                                if path.is_file() && path.extension().map_or(false, |ext| ext == "json") && path.file_stem().map_or(false, |stem| stem.to_string_lossy().ends_with(".info")) {
                                    let json_path_str = path.to_string_lossy().to_string();
                                    println!("Found potential info.json: {}", json_path_str);
                                    
                                    // Read and parse the JSON
                                    if let Ok(json_content) = fs::read_to_string(&path) {
                                        if let Ok(info) = serde_json::from_str::<JsonValue>(&json_content) {
                                            println!("Successfully parsed info.json: {}", json_path_str);
                                            processed_json = true; // Mark that we parsed a JSON

                                            // Extract common details
                                            video_title = info.get("title").and_then(|v| v.as_str()).map(String::from);
                                            thumbnail_url = info.get("thumbnail").and_then(|v| v.as_str()).map(String::from);
                                            let ext = info.get("ext").and_then(|v| v.as_str());

                                            // *** Determine the actual video file path (Priority: _filename) ***
                                            
                                            // 1. Check '_filename' (often relative path used by yt-dlp)
                                            if let Some(relative_filename) = info.get("_filename").and_then(|v| v.as_str()) {
                                                 let potential_path = Path::new(&download_dir).join(relative_filename);
                                                 if potential_path.exists() {
                                                    actual_video_path = Some(potential_path.to_string_lossy().to_string());
                                                     println!("Found video path from '_filename' in info.json: {:?}", actual_video_path);
                                                 } else {
                                                     println!("Path from '_filename' ('{}') does not exist.", potential_path.display());
                                                 }
                                            }

                                            // *** 2. Construct path from template and JSON data (Fallback) ***
                                            if actual_video_path.is_none() {
                                                println!("'_filename' field not found or invalid in info.json. Attempting construction...");
                                                if let (Some(title), Some(extension)) = (video_title.as_deref(), ext) {
                                                    let channel = info.get("channel").and_then(|v| v.as_str()).unwrap_or("UnknownChannel");
                                                    let base_filename_template = "%(title)s by %(channel)s.%(ext)s"; // Our original template
                                                    
                                                    // Sanitize parts from JSON before substituting
                                                    let sanitized_title = sanitize_filename(title);
                                                    let sanitized_channel = sanitize_filename(channel);
                                                    
                                                    let constructed_filename = base_filename_template
                                                        .replace("%(title)s", &sanitized_title)
                                                        .replace("%(channel)s", &sanitized_channel)
                                                        .replace("%(ext)s", extension);
                                                    
                                                    let constructed_path = Path::new(&download_dir).join(&constructed_filename);
                                                    println!("Attempting constructed path: {}", constructed_path.display());

                                                    if constructed_path.exists() {
                                                        actual_video_path = Some(constructed_path.to_string_lossy().to_string());
                                                        println!("Successfully used constructed video path: {:?}", actual_video_path);
                                                    } else {
                                                        println!("Warning: Constructed video path does not exist: {}", constructed_path.display());
                                                        // Last resort: Try replacing extension on the info.json path itself
                                                        let video_path_from_json = json_path_str.replace(".info.json", &format!(".{}", extension));
                                                         if Path::new(&video_path_from_json).exists() {
                                                            actual_video_path = Some(video_path_from_json);
                                                            println!("Used video path derived directly from info.json path: {:?}", actual_video_path);
                                                         } else {
                                                             println!("Warning: Video path derived from info.json path also doesn't exist: {}", video_path_from_json);
                                                         }
                                                    }
                                                } else {
                                                    println!("Warning: Could not extract title or extension from info.json to construct path.");
                                                }
                                            }
                                            
                                            // Clean up the info.json file? Maybe not automatically.
                                            // let _ = fs::remove_file(&path); 

                                            break; // Found and processed a json, stop searching

                                        } else {
                                            eprintln!("Error parsing JSON content from {}", json_path_str);
                                        }
                                    } else {
                                        eprintln!("Error reading file content from {}", json_path_str);
                                    }
                                }
                            }
                        }

                        if !processed_json {
                             println!("Warning: Could not find or process any .info.json file for item {}. Cannot determine exact filename.", item_id);
                        }
                        
                        // --- Update Database with determined info --- 
                        if actual_video_path.is_none() {
                             println!("CRITICAL WARNING: Final video path could not be determined for item {}. Upload WILL likely fail. Storing template path as fallback.", item_id);
                             // Fallback: Store the template path, acknowledging it's likely wrong for uploads
                             actual_video_path = Some(output_path_str.clone()); // This is the source of the error if hit
                        }

                        println!("Updating DB for item {}: status='completed', title='{:?}', path='{:?}', thumb='{:?}'", 
                            item_id, video_title, actual_video_path, thumbnail_url);
                        
                        if let Err(e) = (*db_lock_after).update_item_after_download(
                            &item_id,
                            "completed", 
                            video_title,
                            actual_video_path,
                            thumbnail_url,
                            Some("Download complete".to_string())
                        ) {
                            eprintln!("Error updating item {} details after download: {}", item_id, e);
                        } else {
                            println!("Item {} details updated after successful download.", item_id);
                        }
                    } else {
                        // Update status to failed on error
                        if let Err(e) = (*db_lock_after).update_item_status(&item_id, "failed", final_message.clone()) {
                           eprintln!("Error updating item {} status to failed: {}", item_id, e);
                        } else {
                           println!("Item {} status updated to 'failed'.", item_id);
                        }
                    }

                    // Check for auto-upload (keep this logic)
                    let settings_after = match (*db_lock_after).get_settings() {
                        Ok(s) => s,
                        Err(_) => AppSettings::default()
                    };

                    if download_success && settings_after.auto_upload.unwrap_or_else(|| "false".to_string()) == "true" {
                        println!("Auto-upload enabled, triggering upload for {}", item_id);
                        // Use tokio::spawn for non-blocking upload trigger
                        let upload_id = item_id.clone();
                        let app_handle_clone = app_handle.clone();
                        tokio::spawn(async move {
                            if let Err(e) = trigger_upload(upload_id.clone(), app_handle_clone.state()).await {
                                eprintln!("Auto-upload failed for {}: {}", upload_id, e);
                                // Optionally update status back to indicate upload failure
                            }
                        });
                    }
                }
            } else {
                println!("Skipping download for item {} due to previous error.", item_id);
                // No need to sleep long here, the outer loop handles it
            }
            // --- End Download Execution --- 

        } 
        
        // Sleep before next check
        let sleep_duration = if should_sleep_long { Duration::from_secs(10) } else { Duration::from_millis(500) }; // Sleep less if we processed an item
        sleep(sleep_duration).await;
        
    }
}
// --- End Background Queue Processing ---

#[tokio::main]
async fn main() {
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
            restart_encoding,
            get_gallery_items
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

            // --- Spawn the background queue processor ---
            let app_handle_clone = app.handle().clone();
            tokio::spawn(process_queue_background(app_handle_clone));

            // --- Temporarily enable DevTools for release build debugging ---
            // #[cfg(debug_assertions)]
            {
                let window = app.get_window("main").unwrap();
                window.open_devtools();
                window.close_devtools(); // Close initially, user can reopen with F12
            }
            // --- End Temporary DevTools ---
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}