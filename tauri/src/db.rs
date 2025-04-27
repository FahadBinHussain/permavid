use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use uuid::Uuid;
use chrono::Utc;
use std::path::Path;

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
        
        // Check if we need to import old data
        let database = Self {
            conn: Arc::new(Mutex::new(conn)),
        };

        // Try to import data from the old database if present
        database.import_old_data(app_handle).unwrap_or_else(|e| {
            println!("Note: Could not import old data: {}", e);
        });
        
        Ok(database)
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
        
        // First check if the settings table exists
        if !self.table_exists(&conn, "settings") {
            // Return default settings if the table doesn't exist
            return Ok(AppSettings {
                filemoon_api_key: None,
                files_vc_api_key: None,
                download_directory: None,
                delete_after_upload: None,
                auto_upload: None,
                upload_target: None,
            });
        }
        
        let mut settings = AppSettings {
            filemoon_api_key: None,
            files_vc_api_key: None,
            download_directory: None,
            delete_after_upload: None,
            auto_upload: None,
            upload_target: None,
        };
        
        let mut stmt = match conn.prepare("SELECT key, value FROM settings") {
            Ok(stmt) => stmt,
            Err(e) => {
                println!("Error preparing settings query: {}", e);
                return Ok(settings); // Return default settings on error
            }
        };
        
        let rows = match stmt.query_map([], |row| {
            let key: String = row.get(0)?;
            let value: String = row.get(1)?;
            Ok((key, value))
        }) {
            Ok(rows) => rows,
            Err(e) => {
                println!("Error querying settings: {}", e);
                return Ok(settings); // Return default settings on error
            }
        };
        
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

    // Function to import data from old database or storage
    fn import_old_data(&self, app_handle: &AppHandle) -> Result<()> {
        // Try to locate previous database file
        // First check the app data directory (for previous Tauri/Electron versions)
        let app_dir = app_handle.path_resolver().app_data_dir().expect("Failed to get app data directory");
        let old_db_path = app_dir.join("old_permavid_local.sqlite");
        
        // Also check the user's home directory (common location for Electron apps)
        let home_dir = dirs::home_dir().unwrap_or_default();
        let electron_db_paths = vec![
            home_dir.join(".permavid").join("permavid_local.sqlite"),
            home_dir.join("AppData").join("Roaming").join("permavid").join("permavid_local.sqlite"),
            home_dir.join(".config").join("permavid").join("permavid_local.sqlite")
        ];
        
        // Check current directory too
        let current_dir_path = std::env::current_dir().unwrap_or_default().join("permavid_local.sqlite");
        
        // Try to open and import from old database
        let mut imported = false;
        
        // First try the specific old db path
        if old_db_path.exists() {
            if let Ok(_) = self.import_from_db_file(&old_db_path) {
                imported = true;
                println!("Successfully imported data from old database");
            }
        }
        
        // Then try common Electron paths
        if !imported {
            for path in electron_db_paths {
                if path.exists() {
                    if let Ok(_) = self.import_from_db_file(&path) {
                        imported = true;
                        println!("Successfully imported data from Electron database: {:?}", path);
                        break;
                    }
                }
            }
        }
        
        // Finally check current directory
        if !imported && current_dir_path.exists() {
            if let Ok(_) = self.import_from_db_file(&current_dir_path) {
                imported = true;
                println!("Successfully imported data from current directory database");
            }
        }
        
        Ok(())
    }
    
    fn import_from_db_file(&self, db_path: &std::path::Path) -> Result<()> {
        // Connect to the old database
        let old_conn = Connection::open(db_path)?;
        let mut dest_conn = self.conn.lock().unwrap();
        
        // Start a transaction
        let transaction = dest_conn.transaction()?;
        
        // Import videos if the table exists
        if self.table_exists(&old_conn, "videos") {
            let mut stmt = old_conn.prepare("SELECT title, url, local_path, thumbnail, status, created_at FROM videos")?;
            let video_iter = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?, // title
                    row.get::<_, String>(1)?, // url
                    row.get::<_, Option<String>>(2)?, // local_path
                    row.get::<_, Option<String>>(3)?, // thumbnail
                    row.get::<_, String>(4)?, // status
                    row.get::<_, String>(5)?, // created_at
                ))
            })?;
            
            for video_result in video_iter {
                if let Ok((title, url, local_path, thumbnail, status, created_at)) = video_result {
                    transaction.execute(
                        "INSERT OR IGNORE INTO videos (title, url, local_path, thumbnail, status, created_at) 
                         VALUES (?, ?, ?, ?, ?, ?)",
                        params![title, url, local_path, thumbnail, status, created_at],
                    )?;
                }
            }
        }
        
        // Import queue items if the table exists
        if self.table_exists(&old_conn, "queue") {
            // Try to import with new schema first
            let columns = "id, url, status, message, title, filemoon_url, files_vc_url, encoding_progress, thumbnail_url, added_at, updated_at";
            let mut stmt = match old_conn.prepare(&format!("SELECT {} FROM queue", columns)) {
                Ok(stmt) => stmt,
                Err(_) => {
                    // If new schema fails, try with a simpler old schema and adapt
                    println!("Trying alternate schema for queue import");
                    old_conn.prepare("SELECT id, url, status, message, title, NULL, NULL, NULL, NULL, CAST(strftime('%s') * 1000 as INTEGER), CAST(strftime('%s') * 1000 as INTEGER) FROM queue")?
                }
            };
            
            let now = Utc::now().timestamp_millis();
            let item_iter = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?, // id
                    row.get::<_, String>(1)?, // url
                    row.get::<_, String>(2)?, // status
                    row.get::<_, Option<String>>(3)?, // message
                    row.get::<_, Option<String>>(4)?, // title
                    row.get::<_, Option<String>>(5)?, // filemoon_url
                    row.get::<_, Option<String>>(6)?, // files_vc_url
                    row.get::<_, Option<i32>>(7)?, // encoding_progress
                    row.get::<_, Option<String>>(8)?, // thumbnail_url
                    row.get::<_, Option<i64>>(9).unwrap_or(Some(now)), // added_at
                    row.get::<_, Option<i64>>(10).unwrap_or(Some(now)), // updated_at
                ))
            })?;
            
            for item_result in item_iter {
                if let Ok((id, url, status, message, title, filemoon_url, files_vc_url, encoding_progress, thumbnail_url, added_at, updated_at)) = item_result {
                    transaction.execute(
                        "INSERT OR IGNORE INTO queue (id, url, status, message, title, filemoon_url, files_vc_url, encoding_progress, thumbnail_url, added_at, updated_at) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        params![id, url, status, message, title, filemoon_url, files_vc_url, encoding_progress, thumbnail_url, added_at, updated_at],
                    )?;
                }
            }
        }
        
        // Import settings if the table exists
        if self.table_exists(&old_conn, "settings") {
            let mut stmt = old_conn.prepare("SELECT key, value FROM settings")?;
            let settings_iter = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?, // key
                    row.get::<_, String>(1)?, // value
                ))
            })?;
            
            for setting_result in settings_iter {
                if let Ok((key, value)) = setting_result {
                    transaction.execute(
                        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                        params![key, value],
                    )?;
                }
            }
        }
        
        // Also migrate old video data to new queue format if needed
        if self.table_exists(&old_conn, "videos") && !self.has_queue_data(&transaction)? {
            // No queue data yet, so let's migrate videos to queue
            let mut stmt = old_conn.prepare(
                "SELECT title, url, local_path, thumbnail, status, created_at FROM videos 
                 WHERE status IN ('downloaded', 'completed')"
            )?;
            
            let now = Utc::now().timestamp_millis();
            let video_iter = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?, // title
                    row.get::<_, String>(1)?, // url
                    row.get::<_, Option<String>>(2)?, // local_path
                    row.get::<_, Option<String>>(3)?, // thumbnail
                    row.get::<_, String>(4)?, // status
                    row.get::<_, String>(5)?, // created_at
                ))
            })?;
            
            for video_result in video_iter {
                if let Ok((title, url, _local_path, thumbnail, status, _created_at)) = video_result {
                    let id = Uuid::new_v4().to_string();
                    let queue_status = if status == "downloaded" { "completed" } else { &status };
                    
                    transaction.execute(
                        "INSERT INTO queue (id, url, status, message, title, thumbnail_url, added_at, updated_at) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        params![
                            id, 
                            url, 
                            queue_status, 
                            "Migrated from old database", 
                            title, 
                            thumbnail, 
                            now, 
                            now
                        ],
                    )?;
                }
            }
        }
        
        // Commit all imported data
        transaction.commit()?;
        Ok(())
    }
    
    fn table_exists(&self, conn: &Connection, table_name: &str) -> bool {
        let query = format!(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='{}'",
            table_name
        );
        
        match conn.query_row(&query, [], |_| Ok(())) {
            Ok(_) => true,
            Err(_) => false,
        }
    }
    
    fn has_queue_data(&self, transaction: &rusqlite::Transaction) -> Result<bool> {
        let count: i64 = transaction.query_row("SELECT COUNT(*) FROM queue", [], |row| row.get(0))?;
        Ok(count > 0)
    }

    // Method for manual import from a specific path - called via Tauri command
    pub fn manual_import_from_path(&self, path: &str) -> Result<()> {
        let db_path = Path::new(path);
        if !db_path.exists() {
            return Err(rusqlite::Error::InvalidPath(format!("File does not exist: {}", path).into()));
        }
        
        self.import_from_db_file(db_path)
    }
} 