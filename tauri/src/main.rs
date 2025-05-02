// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Ensure db module is included
mod db;

// Explicitly use the Database struct
use crate::db::Database;

use db::{QueueItem, AppSettings};
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
    // More robust sanitization: replace common problematic chars and any non-alphanumeric (excluding ., -, _)
    name.chars().map(|c| {
        match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | // Standard problematic chars
            '？' | '｜' | // Specific chars from the example
            '#' | '%' | '&' | '{' | '}' | '$' | '!' | '@' | '+' | '`' | '=' // Other potentially problematic chars
             => '_', 
            _ if c.is_control() => '_', // Control characters
            // Allow letters, numbers, period, hyphen, underscore. Replace others.
            _ if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' => c, 
            _ => '_' // Replace any other character not explicitly allowed
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
struct FilemoonUploadResult {
    files: Option<Vec<FilemoonFile>>,
}

#[derive(Debug, Deserialize, Serialize)]
struct FilemoonGetUploadServerResponse {
    status: u16,
    msg: String,
    result: String,
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
    status: u16,
    msg: String,
    result: Option<FilemoonEncodingStatusResult>,
}

#[derive(Debug, Serialize, Deserialize)]
struct FilemoonEncodingStatusResult {
    file_code: String,
    quality: Option<String>,
    name: Option<String>,
    progress: Option<String>, // Can be numeric or string like "91"
    status: String,          // e.g., "ENCODING", "FINISHED", "ERROR"
    error: Option<String>,
}

// --- ADDED: Structs for Filemoon File Info API ---
#[derive(Debug, Serialize, Deserialize)]
struct FilemoonFileInfoResponse {
    status: u16,
    msg: String,
    result: Option<Vec<FilemoonFileInfoResult>>, // API returns an array
}

#[derive(Debug, Serialize, Deserialize)]
struct FilemoonFileInfoResult {
    status: u16, // Status per file in the result array
    file_code: String,
    name: Option<String>,
    canplay: Option<i32>, // 0 or 1
    // Add other fields if needed (views, length, uploaded)
}
// --- END ADDED ---

// --- ADDED: Helper to extract video ID from common FB URLs ---
fn extract_facebook_video_id(url_str: &str) -> Option<String> {
    let reel_regex = Regex::new(r"/reel/(\d+)").unwrap();
    let watch_regex = Regex::new(r"[?&]v=(\d+)").unwrap();

    if let Some(caps) = reel_regex.captures(url_str) {
        return caps.get(1).map(|m| m.as_str().to_string());
    }
    if let Some(caps) = watch_regex.captures(url_str) {
        return caps.get(1).map(|m| m.as_str().to_string());
    }
    None
}
// --- END ADDED ---

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
                 {
                     let db_err = app_state.db.lock().unwrap();
                     let _ = db_err.update_item_status(&item_id_clone, "failed", Some("Filemoon API key not configured".to_string()));
                 }
                return Err("Filemoon API key not configured".to_string());
            }
        };
        println!("Attempting to upload {} to Filemoon...", filename);

        // --- Step 1: Get Upload Server URL --- 
        let upload_server_url: String;
        match client.get("https://api.filemoon.sx/api/upload/server")
            .query(&[("key", &api_key)])
            .send()
            .await {
            Ok(response) => {
                let get_server_status = response.status();
                match response.json::<FilemoonGetUploadServerResponse>().await {
                    Ok(resp_body) => {
                        if get_server_status.is_success() && resp_body.status == 200 && !resp_body.result.is_empty() {
                            upload_server_url = resp_body.result;
                            println!("Got Filemoon upload server: {}", upload_server_url);
                        } else {
                            let err_msg = format!("Filemoon GetServer API Error (Status {}): {}", resp_body.status, resp_body.msg);
                            println!("{}", err_msg);
                             {
                                 let db_lock = app_state.db.lock().unwrap();
                                 let _ = db_lock.update_item_status(&item_id_clone, "failed", Some(err_msg.clone()));
                            }
                            return Err(err_msg); // Stop here if we can't get upload server
                        }
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to parse Filemoon GetServer response: {}", e);
                        println!("{}", err_msg);
                         {
                            let db_lock = app_state.db.lock().unwrap();
                            let _ = db_lock.update_item_status(&item_id_clone, "failed", Some(err_msg.clone()));
                         }
                        return Err(err_msg);
                    }
                }
            }
            Err(e) => {
                let err_msg = format!("Filemoon GetServer request failed: {}", e);
                println!("{}", err_msg);
                 {
                    let db_lock = app_state.db.lock().unwrap();
                    let _ = db_lock.update_item_status(&item_id_clone, "failed", Some(err_msg.clone()));
                 }
                return Err(err_msg);
            }
        }
        // --- End Step 1 ---
        
        // --- Step 2: Upload to the Obtained Server URL --- 
        // Sanitize the filename before sending it to Filemoon
        let sanitized_filename = sanitize_filename(&filename);
        println!("Sanitized filename for upload: {}", sanitized_filename);
        
        // Read file into memory to avoid streaming issues
        let file_bytes = fs::read(&local_path).map_err(|e| format!("Failed to read file: {}", e))?;
        
        // Create the multipart form exactly per API docs
        let form = reqwest::multipart::Form::new()
            .text("key", api_key.clone())
            .part("file", reqwest::multipart::Part::bytes(file_bytes)
                .file_name(sanitized_filename.clone()));
                
        // Log the upload details for debugging
        println!("Uploading to Filemoon URL: {}", upload_server_url);
        println!("Using multipart with in-memory file data");
        
        // POST to the URL obtained in Step 1
        match client.post(&upload_server_url)
            .multipart(form)
            .send()
            .await {
            Ok(response) => {
                let upload_status = response.status();
                // Read the response body as text first for debugging
                match response.text().await {
                    Ok(raw_text) => {
                        println!("Filemoon Upload Raw Response Status: {}", upload_status);
                        println!("Filemoon Upload Raw Response Body: {}", raw_text);

                        // Now attempt to parse the raw text as JSON
                        match serde_json::from_str::<FilemoonUploadResponse>(&raw_text) {
                            Ok(resp_body) => {
                                // Check using the parsed JSON
                                if upload_status.is_success() && resp_body.status == 200 && resp_body.files.as_ref().map_or(false, |f| !f.is_empty()) {
                                    let filecode = resp_body.files.unwrap().remove(0).filecode;
                                    println!("Filemoon upload successful! Filecode: {}", filecode);
                                    {
                                        let db_lock = app_state.db.lock().unwrap();
                                        let _ = db_lock.update_item_status(&item_id_clone, "transferring", Some(format!("Filemoon: {}. Awaiting encoding...", filecode)));
                                        let mut updated_item = db_lock.get_item_by_id(&item_id_clone).map_err(|e| format!("DB Error: {}", e))?.unwrap();
                                        updated_item.filemoon_url = Some(filecode.clone());
                                        if let Err(e) = db_lock.update_queue_item(&updated_item) { eprintln!("Failed to update Filemoon URL in DB: {}", e); }
                                    }
                                    final_message = format!("Upload to Filemoon successful (Filecode: {}). Awaiting encoding.", filecode);
                                    success = true;
                                } else {
                                    let err_msg = format!("Filemoon Upload API Error (Status {}): {} - Parsed from JSON: {:?}", 
                                                        resp_body.status, resp_body.msg, resp_body);
                                    println!("{}", err_msg);
                                    {
                                        let db_lock = app_state.db.lock().unwrap();
                                        let _ = db_lock.update_item_status(&item_id_clone, "failed", Some(err_msg.clone()));
                                    }
                                    final_message = err_msg;
                                }
                            }
                            Err(e) => {
                                // JSON parsing failed, use the raw text in the error message
                                let err_msg = format!("Failed to parse Filemoon Upload JSON response (Status {}): {}. Raw Body: {}", 
                                                    upload_status, e, raw_text);
                                println!("{}", err_msg);
                                {
                                    let db_lock = app_state.db.lock().unwrap();
                                    let _ = db_lock.update_item_status(&item_id_clone, "failed", Some(err_msg.clone()));
                                }
                                final_message = err_msg;
                            }
                        }
                    }
                    Err(e) => {
                        // Failed to even read the response body as text
                        let err_msg = format!("Failed to read Filemoon Upload response body (Status {}): {}", upload_status, e);
                        println!("{}", err_msg);
                        {
                            let db_lock = app_state.db.lock().unwrap();
                            let _ = db_lock.update_item_status(&item_id_clone, "failed", Some(err_msg.clone()));
                        }
                        final_message = err_msg;
                    }
                }
            }
            Err(e) => {
                let err_msg = format!("Filemoon Upload request failed: {}", e);
                println!("{}", err_msg);
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
                 {
                     let db_err = app_state.db.lock().unwrap();
                     let _ = db_err.update_item_status(&item_id_clone, "failed", Some("Files.vc API key not configured".to_string()));
                 }
                return Err("Files.vc API key not configured".to_string());
            }
        };
        println!("Attempting to upload {} to Files.vc...", filename);
        
        // File open needs to be async
        let file = match File::open(&local_path).await {
            Ok(f) => f,
            Err(e) => {
                 {
                     let db_err = app_state.db.lock().unwrap();
                     let _ = db_err.update_item_status(&item_id_clone, "failed", Some(format!("Failed to open file: {}", e)));
                 }
                 return Err(format!("Failed to open file: {}", e));
            }
        };
        let stream = FramedRead::new(file, BytesCodec::new());
        let file_body = reqwest::Body::wrap_stream(stream.map_ok(Bytes::from));
        
        // Sanitize the filename before sending it to Files.vc (similar to Filemoon)
        let sanitized_filename = sanitize_filename(&filename);
        println!("Sanitized filename for Files.vc upload: {}", sanitized_filename);
        
        let form = multipart::Form::new()
            .text("key", api_key)
            .part("file", multipart::Part::stream(file_body).file_name(sanitized_filename.clone()));
            
        match client.post("https://api.files.vc/upload").multipart(form).send().await {
             Ok(response) => {
                let status = response.status();
                 match response.json::<FilesVcUploadResponse>().await {
                    Ok(resp_body) => {
                        if status.is_success() && resp_body.status == 200 && resp_body.result.is_some() {
                            let result_data = resp_body.result.unwrap();
                            let file_url = result_data.url;
                            println!("Files.vc upload successful! URL: {}", file_url);
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

// --- ADDED: Function to check Filemoon Encoding Status ---
async fn check_filemoon_status(item_id: &str, filecode: &str, api_key: &str, app_handle: &tauri::AppHandle) {
    println!("Checking Filemoon status for item: {}, filecode: {}", item_id, filecode);
    let client = reqwest::Client::new();
    let url = "https://api.filemoon.sx/api/encoding/status";
    
    match client.get(url)
        .query(&[("key", api_key), ("file_code", filecode)])
        .send()
        .await {
        Ok(response) => {
            let status = response.status();
            match response.json::<FilemoonEncodingStatusResponse>().await {
                Ok(resp_body) => {
                    if status.is_success() && resp_body.status == 200 {
                        if let Some(result) = resp_body.result {
                            let api_status = result.status.to_uppercase();
                            let progress = result.progress.and_then(|p| p.parse::<i32>().ok());
                            let mut message = format!("Filemoon status: {}", api_status);
                            if let Some(p) = progress { message.push_str(&format!(" ({}%)", p)); }
                            
                            let new_db_status = match api_status.as_str() {
                                "ENCODING" => "encoding",
                                "FINISHED" | "ACTIVE" => "encoded", // Consider FINISHED or ACTIVE as ready
                                "ERROR" => "failed",
                                _ => "transferring", // Keep checking if status unknown
                            };
                            
                            println!("Item {} Filemoon Status Update: DB={}, API={}, Progress={:?}", item_id, new_db_status, api_status, progress);
                            
                            // Always update DB with the status from encoding/status endpoint
                            let state: State<'_, AppState> = app_handle.state();
                            let db_lock = state.db.lock().unwrap();
                            let _ = (*db_lock).update_item_encoding_details(item_id, new_db_status, progress, Some(message));
                            
                        } else {
                            eprintln!("Filemoon status check successful but no result data for item {}", item_id);
                            // --- ADDED: Handle case where encoding status might be empty/invalid after upload --- 
                            // Optionally, trigger a file/info check here as a fallback
                             println!("No result data in encoding/status for {}. Triggering file/info check.", item_id);
                             let item_id_clone = item_id.to_string();
                             let filecode_clone = filecode.to_string();
                             let api_key_clone = api_key.to_string();
                             let handle_clone = app_handle.clone();
                             tokio::spawn(async move {
                                 check_filemoon_file_info(&item_id_clone, &filecode_clone, &api_key_clone, &handle_clone).await;
                             });
                            // --- END ADDED ---
                        }
                    } else {
                        eprintln!("Filemoon Status API Error (Status {}): {} for item {}", resp_body.status, resp_body.msg, item_id);
                         // Maybe update DB status to failed?
                    }
                }
                Err(e) => {
                    eprintln!("Failed to parse Filemoon Status response for item {}: {}", item_id, e);
                    // Maybe update DB status to failed?
                }
            }
        }
        Err(e) => {
            eprintln!("Filemoon Status request failed for item {}: {}", item_id, e);
             // Maybe update DB status to failed?
        }
    }
}
// --- END ADDED ---

// --- ADDED: Function to check Filemoon File Info API ---
// Returns Ok(true) if file is ready (canplay=1), Ok(false) if checked but not ready, Err on API/parse failure.
async fn check_filemoon_file_info(item_id: &str, filecode: &str, api_key: &str, app_handle: &tauri::AppHandle) -> Result<bool, String> {
    println!("Checking Filemoon file/info for item: {}, filecode: {}", item_id, filecode);
    let client = reqwest::Client::new();
    let url = "https://api.filemoon.sx/api/file/info"; // Correct endpoint
    
    match client.get(url)
        .query(&[("key", api_key), ("file_code", filecode)])
        .send()
        .await {
        Ok(response) => {
            let status = response.status();
            // Read body text first for better error reporting
            match response.text().await {
                Ok(raw_text) => {
                    match serde_json::from_str::<FilemoonFileInfoResponse>(&raw_text) {
                        Ok(resp_body) => {
                            if status.is_success() && resp_body.status == 200 {
                                if let Some(results) = resp_body.result {
                                    if let Some(file_info) = results.iter().find(|r| r.file_code == filecode) {
                                        if file_info.status == 200 && file_info.canplay == Some(1) {
                                            println!("Item {} Filemoon file/info shows canplay=1. Marking as encoded.", item_id);
                                            let state: State<'_, AppState> = app_handle.state();
                                            let db_lock = state.db.lock().unwrap();
                                            let _ = (*db_lock).update_item_encoding_details(
                                                item_id, 
                                                "encoded", 
                                                Some(100), 
                                                Some("Filemoon status: Ready (canplay=1)".to_string())
                                            );
                                            Ok(true) // File is ready
                                        } else {
                                            println!("Item {} Filemoon file/info status ({}): canplay={:?}. Not ready yet.", item_id, file_info.status, file_info.canplay);
                                            Ok(false) // Checked, but not ready
                                        }
                                    } else {
                                        let err_msg = format!("Filemoon file/info successful but filecode {} not found in results for item {}. Raw: {}", filecode, item_id, raw_text);
                                        eprintln!("{}", err_msg);
                                        Err(err_msg) // Error: filecode mismatch
                                    }
                                } else {
                                    let err_msg = format!("Filemoon file/info successful but no result array for item {}. Raw: {}", item_id, raw_text);
                                     eprintln!("{}", err_msg);
                                    Err(err_msg)
                                }
                            } else {
                                let err_msg = format!("Filemoon file/info API Error (HTTP {}, API Status {}): {} for item {}. Raw: {}", status, resp_body.status, resp_body.msg, item_id, raw_text);
                                 eprintln!("{}", err_msg);
                                Err(err_msg)
                            }
                        }
                        Err(e) => {
                            let err_msg = format!("Failed to parse Filemoon file/info response for item {}: {}. Raw Body: {}", item_id, e, raw_text);
                            eprintln!("{}", err_msg);
                            Err(err_msg)
                        }
                    }
                }
                Err(e) => {
                     let err_msg = format!("Failed to read Filemoon file/info response body for item {}: {}", item_id, e);
                     eprintln!("{}", err_msg);
                     Err(err_msg)
                }
            }
            
        }
        Err(e) => {
            let err_msg = format!("Filemoon file/info request failed for item {}: {}", item_id, e);
            eprintln!("{}", err_msg);
            Err(err_msg)
        }
    }
}
// --- END ADDED ---

// --- ADDED: Orchestrator function for checking Filemoon readiness ---
async fn check_filemoon_readiness(item_id: &str, filecode: &str, api_key: &str, app_handle: &tauri::AppHandle) {
    // 1. Check file/info first
    match check_filemoon_file_info(item_id, filecode, api_key, app_handle).await {
        Ok(true) => {
            // file/info confirmed ready, status updated inside, nothing more to do.
            println!("Item {} confirmed ready via file/info.", item_id);
        }
        Ok(false) => {
            // file/info says not ready yet, proceed to check encoding/status
            println!("Item {} not ready via file/info, checking encoding/status...", item_id);
            check_filemoon_status(item_id, filecode, api_key, app_handle).await;
        }
        Err(e) => {
            // file/info failed (API error, parse error, etc.), proceed to check encoding/status as fallback
            eprintln!("File/info check failed for {}: {}. Falling back to encoding/status check...", item_id, e);
            check_filemoon_status(item_id, filecode, api_key, app_handle).await;
        }
    }
}
// --- END ADDED ---

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
                // Use a simple, safe output template using the video ID
                let output_template = format!("%(id)s.%(ext)s"); 
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
                cmd.arg("-v"); // Add verbose flag for detailed debugging output
                // Consider adding --format bestvideo+bestaudio/best if needed

                cmd.stdout(Stdio::piped()); // Capture standard output
                cmd.stderr(Stdio::piped()); // Capture standard error
                
                // --- Run yt-dlp Process ---
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
                        let stderr_capture = Arc::new(Mutex::new(String::new()));
                        let stderr_capture_clone = stderr_capture.clone();
                        tokio::spawn(async move {
                            while let Ok(Some(line)) = stderr_reader.next_line().await {
                                println!("[yt-dlp stderr] {}", line);
                                let mut capture = stderr_capture_clone.lock().unwrap();
                                capture.push_str(&line);
                                capture.push('\n');
                            }
                        });

                        match child.wait().await {
                            Ok(status) => {
                                if status.success() {
                                    println!("yt-dlp process finished successfully for item: {}", item_id);
                                    download_success = true;
                                } else {
                                    let stderr_output = stderr_capture.lock().unwrap().trim().to_string();
                                    let err_msg = format!(
                                        "yt-dlp exited with code: {:?}. Stderr: {}",
                                        status.code(),
                                        if stderr_output.is_empty() { "None" } else { &stderr_output }
                                    );
                                    eprintln!("Error for item {}: {}", item_id, err_msg);
                                    // Update DB status directly
                                    {
                                        let state_err: State<'_, AppState> = app_handle.state();
                                        let db_lock_err = state_err.db.lock().unwrap();
                                        let _ = db_lock_err.update_item_status(&item_id, "failed", Some(err_msg));
                                    }
                                }
                            }
                            Err(e) => {
                                let err_msg = format!("Failed to wait for yt-dlp process: {}", e);
                                eprintln!("Error for item {}: {}", item_id, err_msg);
                                // Update DB status directly
                                {
                                    let state_err: State<'_, AppState> = app_handle.state();
                                    let db_lock_err = state_err.db.lock().unwrap();
                                    let _ = db_lock_err.update_item_status(&item_id, "failed", Some(err_msg));
                                }
                            }
                        }
                    }
                    Err(e) => {
                         let err_msg = format!("Failed to spawn yt-dlp command: {}. Is yt-dlp installed and in PATH?", e);
                         eprintln!("Error for item {}: {}", item_id, err_msg);
                         // Update DB status directly
                         {
                             let state_err: State<'_, AppState> = app_handle.state();
                             let db_lock_err = state_err.db.lock().unwrap();
                             let _ = db_lock_err.update_item_status(&item_id, "failed", Some(err_msg));
                         }
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
                        
                        let item_original_url = next_item.url.clone(); // Clone the URL for comparison

                        println!("Download successful for item {}. Searching for matching .info.json in dir: {}", item_id, download_dir);

                        // Search for the *correct* .info.json file by matching the URL inside
                        if let Ok(entries) = fs::read_dir(&download_dir) {
                            for entry in entries.filter_map(Result::ok) {
                                let path = entry.path();
                                // Check if it's a .info.json file
                                if path.is_file() && 
                                   path.extension().map_or(false, |ext| ext == "json") && 
                                   path.file_stem().map_or(false, |stem| stem.to_string_lossy().ends_with(".info")) {
                                    
                                    let json_path_str = path.to_string_lossy().to_string();
                                    println!("Item {}: Found potential info.json: {}", item_id, json_path_str);
                                    
                                    // Read and parse the JSON
                                    if let Ok(json_content) = fs::read_to_string(&path) {
                                        if let Ok(info) = serde_json::from_str::<JsonValue>(&json_content) {
                                            // *** Match URL from JSON with item URL ***
                                            println!("Item {}: Parsing info.json: {}", item_id, json_path_str);
                                            let json_url = info.get("webpage_url")
                                                          .or_else(|| info.get("original_url")) // Fallback to original_url
                                                          .and_then(|v| v.as_str());

                                            let urls_match = match json_url {
                                                Some(j_url) => {
                                                    // Try matching by extracted ID first
                                                    let original_id = extract_facebook_video_id(&item_original_url);
                                                    let json_id = extract_facebook_video_id(j_url);
                                                    println!("Item {}: Comparing Original URL '{}' (ID: {:?}) with JSON URL '{}' (ID: {:?})", 
                                                             item_id, item_original_url, original_id, j_url, json_id);
                                                    
                                                    if original_id.is_some() && json_id.is_some() && original_id == json_id {
                                                        println!("Item {}: URLs match based on extracted video ID.", item_id);
                                                        true // IDs match
                                                    } else {
                                                        // Fallback to direct string comparison if IDs don't match or couldn't be extracted
                                                         println!("Item {}: Video IDs don't match or couldn't be extracted. Comparing full URLs.", item_id);
                                                        j_url == item_original_url
                                                    }
                                                },
                                                None => {
                                                     println!("Item {}: No URL found in JSON. Cannot compare.", item_id);
                                                     false // No URL in JSON to compare
                                                }
                                            };

                                            if urls_match {
                                                println!("Item {}: Successfully parsed MATCHING info.json: {}", item_id, json_path_str);
                                                processed_json = true; // Mark that we parsed the correct JSON

                                                // Extract common details
                                                video_title = info.get("title").and_then(|v| v.as_str()).map(String::from);
                                                thumbnail_url = info.get("thumbnail").and_then(|v| v.as_str()).map(String::from);
                                                let ext = info.get("ext").and_then(|v| v.as_str());
                                                println!("Item {}: Extracted from info.json - title='{:?}', thumb='{:?}', ext='{:?}'", item_id, video_title, thumbnail_url, ext);

                                                // Determine the actual video file path (Priority: _filename)
                                                if let Some(relative_filename) = info.get("_filename").and_then(|v| v.as_str()) {
                                                    println!("Item {}: Found '_filename' field in info.json: '{}'", item_id, relative_filename);
                                                     let potential_path = Path::new(&download_dir).join(relative_filename);
                                                     if potential_path.exists() {
                                                        actual_video_path = Some(potential_path.to_string_lossy().to_string());
                                                        println!("Item {}: Confirmed video path from '_filename' exists: {:?}", item_id, actual_video_path);
                                                     } else {
                                                        println!("Item {}: WARNING - Path from '_filename' ('{}') does not exist.", item_id, potential_path.display());
                                                     }
                                                }

                                                // Construct path from template (Fallback)
                                                if actual_video_path.is_none() {
                                                    println!("Item {}: '_filename' not found/valid in info.json. Attempting path construction...", item_id);
                                                    if let (Some(title), Some(extension)) = (video_title.as_deref(), ext) {
                                                        let channel = info.get("channel").and_then(|v| v.as_str()).unwrap_or("UnknownChannel");
                                                        let base_filename_template = "%(title)s by %(channel)s.%(ext)s";
                                                        let sanitized_title = sanitize_filename(title);
                                                        let sanitized_channel = sanitize_filename(channel);
                                                        println!("Item {}: Constructing filename with title='{}', channel='{}', ext='{}'", item_id, sanitized_title, sanitized_channel, extension);
                                                        let constructed_filename = base_filename_template
                                                            .replace("%(title)s", &sanitized_title)
                                                            .replace("%(channel)s", &sanitized_channel)
                                                            .replace("%(ext)s", extension);
                                                        let constructed_path = Path::new(&download_dir).join(&constructed_filename);
                                                        println!("Item {}: Attempting constructed path: {}", item_id, constructed_path.display());
                                                        if constructed_path.exists() {
                                                            actual_video_path = Some(constructed_path.to_string_lossy().to_string());
                                                            println!("Item {}: Successfully confirmed constructed video path exists: {:?}", item_id, actual_video_path);
                                                        } else {
                                                            println!("Item {}: WARNING - Constructed video path does not exist: {}", item_id, constructed_path.display());
                                                            let video_path_from_json = json_path_str.replace(".info.json", &format!(".{}", extension));
                                                            println!("Item {}: Trying path derived from info.json filename: {}", item_id, video_path_from_json);
                                                             if Path::new(&video_path_from_json).exists() {
                                                                actual_video_path = Some(video_path_from_json);
                                                                println!("Item {}: Successfully used video path derived from info.json path: {:?}", item_id, actual_video_path);
                                                             } else {
                                                                println!("Item {}: WARNING - Video path derived from info.json path also doesn't exist: {}", item_id, video_path_from_json);
                                                             }
                                                        }
                                                    } else {
                                                        println!("Item {}: WARNING - Could not extract title or extension from info.json to construct path.", item_id);
                                                    }
                                                }
                                                
                                                // Clean up the processed info.json file
                                                match fs::remove_file(&path) {
                                                    Ok(_) => println!("Item {}: Removed processed info.json: {}", item_id, json_path_str),
                                                    Err(e) => eprintln!("Item {}: Failed to remove processed info.json {}: {}", item_id, json_path_str, e),
                                                }

                                                break; // Found the matching json, stop searching
                                            } else {
                                                // URL didn't match, log and continue searching
                                                println!("Item {}: URLs do not match (checked IDs and direct comparison), skipping info.json.", item_id);
                                            }
                                        } else {
                                            eprintln!("Item {}: Error parsing JSON content from {}. Skipping.", item_id, json_path_str);
                                        }
                                    } else {
                                        eprintln!("Item {}: Error reading file content from {}. Skipping.", item_id, json_path_str);
                                    }
                                }
                            } // End of directory iteration
                        }

                        if !processed_json {
                             println!("Item {}: WARNING - Could not find a matching .info.json file. Cannot determine exact filename.", item_id);
                        }
                        
                        // --- Update Database with determined info --- 
                        if actual_video_path.is_none() {
                             println!("Item {}: CRITICAL WARNING - Final video path could not be determined. Upload WILL likely fail. Storing template path as fallback.", item_id);
                             // Storing None instead to make the error more obvious later
                             actual_video_path = None; 
                        }

                        println!("Item {}: Updating DB status='completed', title='{:?}', path='{:?}', thumb='{:?}'", 
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
                        // Update status to failed on error (already done within error handling above)
                        // No need to update status again here unless a new error occurred
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

        } else {
            // --- Check status of transferring/encoding items if no new item to process ---
            let items_to_check: Vec<(String, String, String)>;
            {
                let state: State<'_, AppState> = app_handle.state();
                // Define db_lock before using it
                let db_lock = state.db.lock().unwrap(); 
                // Explicitly dereference db_lock
                items_to_check = match (*db_lock).get_items_for_status_check() {
                    Ok(items) => items,
                    Err(e) => {
                        eprintln!("DB Error fetching items for status check: {}", e);
                        Vec::new() // Empty vec on error
                    }
                };
            }

            if !items_to_check.is_empty() {
                should_sleep_long = false; // Found items to check, don't sleep long
                for (item_id, filecode, api_key) in items_to_check {
                    // Spawn a task for each status check
                    let handle_clone = app_handle.clone();
                    tokio::spawn(async move {
                        // Call the new orchestrator function
                        check_filemoon_readiness(&item_id, &filecode, &api_key, &handle_clone).await;
                    });
                }
            } else {
                // No new items AND no items to check status for, sleep long
                should_sleep_long = true;
            }
        }
        
        // Sleep before next check
        let sleep_duration = if should_sleep_long { Duration::from_secs(15) } else { Duration::from_secs(5) }; // Check status more often than new items
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