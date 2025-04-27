use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use uuid::Uuid;
use chrono::Utc;

// Shared database connection
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Video {
    pub id: Option<i64>,
    pub title: String,
    pub url: String,
    pub local_path: Option<String>,
    pub thumbnail: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueueItem {
    pub id: Option<String>,
    pub url: String,
    pub status: String,
    pub message: Option<String>,
    pub title: Option<String>,
    pub filemoon_url: Option<String>,
    pub files_vc_url: Option<String>,
    pub encoding_progress: Option<i32>,
    pub thumbnail_url: Option<String>,
    pub added_at: Option<i64>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppSettings {
    pub filemoon_api_key: Option<String>,
    pub files_vc_api_key: Option<String>,
    pub download_directory: Option<String>,
    pub delete_after_upload: Option<String>,
    pub auto_upload: Option<String>,
    pub upload_target: Option<String>,
}

impl Database {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        let app_dir = app_handle
            .path_resolver()
            .app_data_dir()
            .expect("Failed to get app data directory");
        
        if !app_dir.exists() {
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");
        }
        
        let db_path = app_dir.join("permavid_local.sqlite");
        let conn = Connection::open(&db_path)?;
        
        // Initialize database schema
        conn.execute(
            "CREATE TABLE IF NOT EXISTS videos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                url TEXT NOT NULL UNIQUE,
                local_path TEXT,
                thumbnail TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS queue (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                status TEXT NOT NULL,
                message TEXT,
                title TEXT,
                filemoon_url TEXT,
                files_vc_url TEXT,
                encoding_progress INTEGER,
                thumbnail_url TEXT,
                added_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )",
            [],
        )?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )",
            [],
        )?;
        
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }
    
    pub fn add_video(&self, video: &Video) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO videos (title, url, local_path, thumbnail, status) VALUES (?, ?, ?, ?, ?)",
            (&video.title, &video.url, &video.local_path, &video.thumbnail, &video.status),
        )?;
        
        Ok(conn.last_insert_rowid())
    }
    
    pub fn get_videos(&self) -> Result<Vec<Video>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, title, url, local_path, thumbnail, status, created_at FROM videos ORDER BY created_at DESC")?;
        
        let video_iter = stmt.query_map([], |row| {
            Ok(Video {
                id: Some(row.get(0)?),
                title: row.get(1)?,
                url: row.get(2)?,
                local_path: row.get(3)?,
                thumbnail: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        
        let mut videos = Vec::new();
        for video in video_iter {
            videos.push(video?);
        }
        
        Ok(videos)
    }
    
    pub fn update_video_status(&self, id: i64, status: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE videos SET status = ? WHERE id = ?",
            (status, id),
        )?;
        
        Ok(())
    }
    
    pub fn update_video_path(&self, id: i64, local_path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE videos SET local_path = ?, status = 'downloaded' WHERE id = ?",
            (local_path, id),
        )?;
        
        Ok(())
    }
    
    pub fn add_queue_item(&self, item: &QueueItem) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        let id = item.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = Utc::now().timestamp_millis();
        
        conn.execute(
            "INSERT INTO queue (id, url, status, message, title, filemoon_url, files_vc_url, encoding_progress, thumbnail_url, added_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                item.url,
                item.status,
                item.message,
                item.title,
                item.filemoon_url,
                item.files_vc_url,
                item.encoding_progress,
                item.thumbnail_url,
                item.added_at.unwrap_or(now),
                item.updated_at.unwrap_or(now)
            ],
        )?;
        
        Ok(id)
    }
    
    pub fn update_queue_item(&self, item: &QueueItem) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp_millis();
        
        if let Some(id) = &item.id {
            conn.execute(
                "UPDATE queue SET 
                 url = ?, 
                 status = ?, 
                 message = ?, 
                 title = ?, 
                 filemoon_url = ?, 
                 files_vc_url = ?, 
                 encoding_progress = ?, 
                 thumbnail_url = ?, 
                 updated_at = ? 
                 WHERE id = ?",
                params![
                    item.url,
                    item.status,
                    item.message,
                    item.title,
                    item.filemoon_url,
                    item.files_vc_url,
                    item.encoding_progress,
                    item.thumbnail_url,
                    now,
                    id
                ],
            )?;
            Ok(())
        } else {
            Err(rusqlite::Error::InvalidParameterName("Item ID is required for update".to_string()))
        }
    }
    
    pub fn update_item_status(&self, id: &str, status: &str, message: Option<String>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = Utc::now().timestamp_millis();
        
        conn.execute(
            "UPDATE queue SET status = ?, message = ?, updated_at = ? WHERE id = ?",
            params![status, message, now, id],
        )?;
        
        Ok(())
    }
    
    pub fn get_queue_items(&self) -> Result<Vec<QueueItem>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, url, status, message, title, filemoon_url, files_vc_url, encoding_progress, thumbnail_url, added_at, updated_at 
             FROM queue 
             ORDER BY added_at DESC"
        )?;
        
        let item_iter = stmt.query_map([], |row| {
            Ok(QueueItem {
                id: Some(row.get(0)?),
                url: row.get(1)?,
                status: row.get(2)?,
                message: row.get(3)?,
                title: row.get(4)?,
                filemoon_url: row.get(5)?,
                files_vc_url: row.get(6)?,
                encoding_progress: row.get(7)?,
                thumbnail_url: row.get(8)?,
                added_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        
        let mut items = Vec::new();
        for item in item_iter {
            items.push(item?);
        }
        
        Ok(items)
    }
    
    pub fn clear_items_by_status(&self, status_types: &[String]) -> Result<()> {
        if status_types.is_empty() {
            return Ok(());
        }
        
        let conn = self.conn.lock().unwrap();
        let placeholders = vec!["?"; status_types.len()].join(",");
        let sql = format!("DELETE FROM queue WHERE status IN ({})", placeholders);
        
        let mut stmt = conn.prepare(&sql)?;
        let mut param_idx = 1;
        
        for status in status_types {
            stmt.raw_bind_parameter(param_idx, status)?;
            param_idx += 1;
        }
        
        stmt.execute([])?;
        Ok(())
    }
    
    pub fn get_settings(&self) -> Result<AppSettings> {
        let conn = self.conn.lock().unwrap();
        let mut settings = AppSettings {
            filemoon_api_key: None,
            files_vc_api_key: None,
            download_directory: None,
            delete_after_upload: None,
            auto_upload: None,
            upload_target: None,
        };
        
        let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |row| {
            let key: String = row.get(0)?;
            let value: String = row.get(1)?;
            Ok((key, value))
        })?;
        
        for row_result in rows {
            if let Ok((key, value)) = row_result {
                match key.as_str() {
                    "filemoon_api_key" => settings.filemoon_api_key = Some(value),
                    "files_vc_api_key" => settings.files_vc_api_key = Some(value),
                    "download_directory" => settings.download_directory = Some(value),
                    "delete_after_upload" => settings.delete_after_upload = Some(value),
                    "auto_upload" => settings.auto_upload = Some(value),
                    "upload_target" => settings.upload_target = Some(value),
                    _ => {}
                }
            }
        }
        
        Ok(settings)
    }
    
    pub fn save_settings(&self, settings: &AppSettings) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        
        // Using a transaction to ensure all settings are saved atomically
        let transaction = conn.transaction()?;
        
        if let Some(value) = &settings.filemoon_api_key {
            Self::upsert_setting(&transaction, "filemoon_api_key", value)?;
        }
        
        if let Some(value) = &settings.files_vc_api_key {
            Self::upsert_setting(&transaction, "files_vc_api_key", value)?;
        }
        
        if let Some(value) = &settings.download_directory {
            Self::upsert_setting(&transaction, "download_directory", value)?;
        }
        
        if let Some(value) = &settings.delete_after_upload {
            Self::upsert_setting(&transaction, "delete_after_upload", value)?;
        }
        
        if let Some(value) = &settings.auto_upload {
            Self::upsert_setting(&transaction, "auto_upload", value)?;
        }
        
        if let Some(value) = &settings.upload_target {
            Self::upsert_setting(&transaction, "upload_target", value)?;
        }
        
        transaction.commit()?;
        Ok(())
    }
    
    fn upsert_setting(transaction: &rusqlite::Transaction, key: &str, value: &str) -> Result<()> {
        transaction.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) 
            ON CONFLICT(key) DO UPDATE SET value = ?",
            params![key, value, value],
        )?;
        Ok(())
    }
} 