// NOTE: This file needs to be updated to use the Neon PostgreSQL connection instead of SQLite
// The backend should connect to the same Neon database defined in NEON_DATABASE_URL
// The functionality should be updated to use a PostgreSQL client instead of SQLite

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::AppHandle;
use uuid::Uuid;
use chrono::Utc;
use std::env;
use dotenv::dotenv;
use deadpool_postgres::{Config, Pool, PoolError, Client as PoolClient, Runtime};
use native_tls::{TlsConnector as NativeTlsConnector};
use postgres_native_tls::MakeTlsConnector;

// Shared database connection pool
pub struct Database {
    pool: Arc<Pool>,
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
    pub local_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct AppSettings {
    pub filemoon_api_key: Option<String>,
    pub files_vc_api_key: Option<String>,
    pub download_directory: Option<String>,
    pub delete_after_upload: Option<String>,
    pub auto_upload: Option<String>,
    pub upload_target: Option<String>,
}

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

impl Database {
    pub fn new(_app_handle: &AppHandle) -> Result<Self> {
        // Load environment variables from .env file
        dotenv().ok();
        
        // Get database URL from environment
        let db_url = env::var("NEON_DATABASE_URL")
            .expect("NEON_DATABASE_URL must be set in .env file");
        
        // Parse the connection string and create a pool config
        let mut config = Config::new();
        config.url = Some(db_url);
        config.connect_timeout = Some(std::time::Duration::from_secs(5));
        
        // Create TLS connector
        let tls_connector = NativeTlsConnector::builder()
            .danger_accept_invalid_certs(true) // For testing only - remove in production
            .build()
            .map_err(|e| e.to_string())?;
        let tls = MakeTlsConnector::new(tls_connector);
        
        // Create the connection pool with TLS support
        let pool = config.create_pool(Some(Runtime::Tokio1), tls)?;
        
        println!("Created Neon PostgreSQL connection pool");
        
        // Return the database instance
        Ok(Database {
            pool: Arc::new(pool),
        })
    }
    
    // Helper function to get a client from the pool
    async fn get_client(&self) -> std::result::Result<PoolClient, PoolError> {
        self.pool.get().await
    }
    
    pub async fn add_video(&self, video: &Video) -> Result<i64> {
        let client = self.get_client().await?;
        
        let row = client.query_one(
            "INSERT INTO videos (title, url, local_path, thumbnail, status) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id",
            &[&video.title, &video.url, &video.local_path, &video.thumbnail, &video.status]
        ).await?;
        
        Ok(row.get::<_, i64>(0))
    }
    
    pub async fn get_videos(&self) -> Result<Vec<Video>> {
        let client = self.get_client().await?;
        
        let rows = client.query(
            "SELECT id, title, url, local_path, thumbnail, status, created_at 
             FROM videos ORDER BY created_at DESC",
            &[]
        ).await?;
        
        let mut videos = Vec::with_capacity(rows.len());
        for row in rows {
            videos.push(Video {
                id: Some(row.get::<_, i64>(0)),
                title: row.get::<_, String>(1),
                url: row.get::<_, String>(2),
                local_path: row.get::<_, Option<String>>(3),
                thumbnail: row.get::<_, Option<String>>(4),
                status: row.get::<_, String>(5),
                created_at: row.get::<_, String>(6),
            });
        }
        
        Ok(videos)
    }
    
    pub async fn update_video_status(&self, id: i64, status: &str) -> Result<()> {
        let client = self.get_client().await?;
        
        client.execute(
            "UPDATE videos SET status = $1 WHERE id = $2",
            &[&status, &id]
        ).await?;
        
        Ok(())
    }
    
    pub async fn update_video_path(&self, id: i64, local_path: &str) -> Result<()> {
        let client = self.get_client().await?;
        
        client.execute(
            "UPDATE videos SET local_path = $1, status = 'downloaded' WHERE id = $2",
            &[&local_path, &id]
        ).await?;
        
        Ok(())
    }
    
    pub async fn add_queue_item(&self, item: &QueueItem) -> Result<String> {
        let client = self.get_client().await?;
        let id = item.id.clone().unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = Utc::now().timestamp_millis();
        
        // Check if URL already exists
        let rows = client.query(
            "SELECT status FROM queue WHERE url = $1 LIMIT 1",
            &[&item.url]
        ).await?;
        
        if !rows.is_empty() {
            let status: String = rows[0].get(0);
            let error_message = if status == "encoded" {
                format!("URL \'{}\' has already been archived.", item.url)
            } else {
                format!("URL \'{}\' already exists in the active queue (status: {}).", item.url, status)
            };
            return Err(error_message.into());
        }
        
        // Insert new queue item
        client.execute(
            "INSERT INTO queue (id, url, status, message, title, filemoon_url, files_vc_url, 
                                encoding_progress, thumbnail_url, added_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
            &[
                &id,
                &item.url,
                &item.status,
                &item.message,
                &item.title,
                &item.filemoon_url,
                &item.files_vc_url,
                &item.encoding_progress,
                &item.thumbnail_url,
                &(item.added_at.unwrap_or(now) as i64),
                &(item.updated_at.unwrap_or(now) as i64)
            ]
        ).await?;
        
        Ok(id)
    }
    
    pub async fn update_queue_item(&self, item: &QueueItem) -> Result<()> {
        let client = self.get_client().await?;
        let now = Utc::now().timestamp_millis();
        
        if let Some(id) = &item.id {
            client.execute(
                "UPDATE queue SET 
                 url = $1, 
                 status = $2, 
                 message = $3, 
                 title = $4, 
                 filemoon_url = $5, 
                 files_vc_url = $6, 
                 encoding_progress = $7, 
                 thumbnail_url = $8, 
                 updated_at = $9,
                 local_path = $10
                 WHERE id = $11",
                &[
                    &item.url,
                    &item.status,
                    &item.message,
                    &item.title,
                    &item.filemoon_url,
                    &item.files_vc_url,
                    &item.encoding_progress,
                    &item.thumbnail_url,
                    &(now as i64),
                    &item.local_path,
                    &id
                ]
            ).await?;
        }
        
        Ok(())
    }
    
    pub async fn update_item_status(&self, id: &str, status: &str, message: Option<String>) -> Result<()> {
        let client = self.get_client().await?;
        let now = Utc::now().timestamp_millis();
        
        client.execute(
            "UPDATE queue SET status = $1, message = $2, updated_at = $3 WHERE id = $4",
            &[&status, &message, &(now as i64), &id]
        ).await?;
        
        Ok(())
    }
    
    pub async fn get_queue_items(&self) -> Result<Vec<QueueItem>> {
        let client = self.get_client().await?;
        
        let rows = client.query(
            "SELECT id, url, status, message, title, filemoon_url, files_vc_url, 
                    encoding_progress, thumbnail_url, added_at, updated_at, local_path
             FROM queue 
             WHERE status != 'encoded'
             ORDER BY added_at DESC",
            &[]
        ).await?;
        
        let mut items = Vec::with_capacity(rows.len());
        for row in rows {
            items.push(QueueItem {
                id: Some(row.get::<_, String>(0)),
                url: row.get::<_, String>(1),
                status: row.get::<_, String>(2),
                message: row.get::<_, Option<String>>(3),
                title: row.get::<_, Option<String>>(4),
                filemoon_url: row.get::<_, Option<String>>(5),
                files_vc_url: row.get::<_, Option<String>>(6),
                encoding_progress: row.get::<_, Option<i32>>(7),
                thumbnail_url: row.get::<_, Option<String>>(8),
                added_at: Some(row.get::<_, i64>(9)),
                updated_at: Some(row.get::<_, i64>(10)),
                local_path: row.get::<_, Option<String>>(11),
            });
        }
        
        Ok(items)
    }
    
    pub async fn get_gallery_items(&self) -> Result<Vec<QueueItem>> {
        let client = self.get_client().await?;
        
        let rows = client.query(
            "SELECT id, url, status, message, title, filemoon_url, files_vc_url, 
                    encoding_progress, thumbnail_url, added_at, updated_at, local_path
             FROM queue 
             WHERE status = 'encoded' OR status = 'completed'
             ORDER BY updated_at DESC",
            &[]
        ).await?;
        
        let mut items = Vec::with_capacity(rows.len());
        for row in rows {
            items.push(QueueItem {
                id: Some(row.get::<_, String>(0)),
                url: row.get::<_, String>(1),
                status: row.get::<_, String>(2),
                message: row.get::<_, Option<String>>(3),
                title: row.get::<_, Option<String>>(4),
                filemoon_url: row.get::<_, Option<String>>(5),
                files_vc_url: row.get::<_, Option<String>>(6),
                encoding_progress: row.get::<_, Option<i32>>(7),
                thumbnail_url: row.get::<_, Option<String>>(8),
                added_at: Some(row.get::<_, i64>(9)),
                updated_at: Some(row.get::<_, i64>(10)),
                local_path: row.get::<_, Option<String>>(11),
            });
        }
        
        Ok(items)
    }
    
    pub async fn get_settings(&self) -> Result<AppSettings> {
        let client = self.get_client().await?;
        
        let mut app_settings = AppSettings::default();
        
        // Query for settings via Prisma's table
        let rows = client.query(
            "SELECT key, value FROM settings WHERE user_id = 'local-user'",
            &[]
        ).await?;
        
        for row in rows {
            let key: String = row.get(0);
            let value: Option<String> = row.get(1);
            
            if let Some(value_str) = value {
                match key.as_str() {
                    "filemoon_api_key" => app_settings.filemoon_api_key = Some(value_str),
                    "files_vc_api_key" => app_settings.files_vc_api_key = Some(value_str),
                    "download_directory" => app_settings.download_directory = Some(value_str),
                    "delete_after_upload" => app_settings.delete_after_upload = Some(value_str),
                    "auto_upload" => app_settings.auto_upload = Some(value_str),
                    "upload_target" => app_settings.upload_target = Some(value_str),
                    "user_settings" => {
                        // Parse JSON settings
                        if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&value_str) {
                            if let Some(obj) = json_value.as_object() {
                                if let Some(val) = obj.get("filemoon_api_key").and_then(|v| v.as_str()) {
                                    app_settings.filemoon_api_key = Some(val.to_string());
                                }
                                if let Some(val) = obj.get("files_vc_api_key").and_then(|v| v.as_str()) {
                                    app_settings.files_vc_api_key = Some(val.to_string());
                                }
                                if let Some(val) = obj.get("download_directory").and_then(|v| v.as_str()) {
                                    app_settings.download_directory = Some(val.to_string());
                                }
                                if let Some(val) = obj.get("delete_after_upload").and_then(|v| v.as_str()) {
                                    app_settings.delete_after_upload = Some(val.to_string());
                                }
                                if let Some(val) = obj.get("auto_upload").and_then(|v| v.as_str()) {
                                    app_settings.auto_upload = Some(val.to_string());
                                }
                                if let Some(val) = obj.get("upload_target").and_then(|v| v.as_str()) {
                                    app_settings.upload_target = Some(val.to_string());
                                }
                            }
                        }
                    },
                    _ => {} // Ignore other keys
                }
            }
        }
        
        Ok(app_settings)
    }
    
    pub async fn save_settings(&self, settings: &AppSettings) -> Result<()> {
        let mut client = self.get_client().await?;
        
        // Create JSON representation for all settings
        let settings_json = serde_json::json!({
            "filemoon_api_key": settings.filemoon_api_key,
            "files_vc_api_key": settings.files_vc_api_key,
            "download_directory": settings.download_directory,
            "delete_after_upload": settings.delete_after_upload,
            "auto_upload": settings.auto_upload,
            "upload_target": settings.upload_target,
        });
        
        // Use a transaction for consistent updates
        let tx = client.transaction().await?;
        
        // Update user_settings JSON blob in settings table
        tx.execute(
            "INSERT INTO settings (key, value, user_id) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (key) 
             DO UPDATE SET value = $2",
            &[&"user_settings", &settings_json.to_string(), &"local-user"]
        ).await?;
        
        // Individual settings might also be stored separately
        if let Some(value) = &settings.filemoon_api_key {
            tx.execute(
                "INSERT INTO settings (key, value, user_id) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (key) 
                 DO UPDATE SET value = $2",
                &[&"filemoon_api_key", value, &"local-user"]
            ).await?;
        }
        
        if let Some(value) = &settings.files_vc_api_key {
            tx.execute(
                "INSERT INTO settings (key, value, user_id) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (key) 
                 DO UPDATE SET value = $2",
                &[&"files_vc_api_key", value, &"local-user"]
            ).await?;
        }
        
        if let Some(value) = &settings.download_directory {
            tx.execute(
                "INSERT INTO settings (key, value, user_id) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (key) 
                 DO UPDATE SET value = $2",
                &[&"download_directory", value, &"local-user"]
            ).await?;
        }
        
        if let Some(value) = &settings.delete_after_upload {
            tx.execute(
                "INSERT INTO settings (key, value, user_id) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (key) 
                 DO UPDATE SET value = $2",
                &[&"delete_after_upload", value, &"local-user"]
            ).await?;
        }
        
        if let Some(value) = &settings.auto_upload {
            tx.execute(
                "INSERT INTO settings (key, value, user_id) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (key) 
                 DO UPDATE SET value = $2",
                &[&"auto_upload", value, &"local-user"]
            ).await?;
        }
        
        if let Some(value) = &settings.upload_target {
            tx.execute(
                "INSERT INTO settings (key, value, user_id) 
                 VALUES ($1, $2, $3) 
                 ON CONFLICT (key) 
                 DO UPDATE SET value = $2",
                &[&"upload_target", value, &"local-user"]
            ).await?;
        }
        
        tx.commit().await?;
        
        Ok(())
    }
    
    pub async fn get_next_queued_item(&self) -> Result<Option<QueueItem>> {
        let client = self.get_client().await?;
        
        let rows = client.query(
            "SELECT id, url, status, message, title, filemoon_url, files_vc_url, 
                    encoding_progress, thumbnail_url, added_at, updated_at, local_path
             FROM queue 
             WHERE status = 'queued'
             ORDER BY added_at ASC
             LIMIT 1",
            &[]
        ).await?;
        
        if rows.is_empty() {
            return Ok(None);
        }
        
        let row = &rows[0];
        let item = QueueItem {
            id: Some(row.get::<_, String>(0)),
            url: row.get::<_, String>(1),
            status: row.get::<_, String>(2),
            message: row.get::<_, Option<String>>(3),
            title: row.get::<_, Option<String>>(4),
            filemoon_url: row.get::<_, Option<String>>(5),
            files_vc_url: row.get::<_, Option<String>>(6),
            encoding_progress: row.get::<_, Option<i32>>(7),
            thumbnail_url: row.get::<_, Option<String>>(8),
            added_at: Some(row.get::<_, i64>(9)),
            updated_at: Some(row.get::<_, i64>(10)),
            local_path: row.get::<_, Option<String>>(11),
        };
        
        Ok(Some(item))
    }
    
    pub async fn is_item_in_status(&self, statuses: &[&str]) -> Result<bool> {
        if statuses.is_empty() {
            return Ok(false);
        }
        
        let client = self.get_client().await?;
        
        // Check each status type individually
        for &status in statuses {
            let rows = client.query(
                "SELECT 1 FROM queue WHERE status = $1 LIMIT 1",
                &[&status]
            ).await?;
            
            if !rows.is_empty() {
                return Ok(true);
            }
        }
        
        Ok(false)
    }
    
    pub async fn update_item_after_download(
        &self,
        id: &str,
        status: &str,
        title: Option<String>,
        local_path: Option<String>,
        thumbnail_url: Option<String>,
        message: Option<String>,
    ) -> Result<()> {
        let client = self.get_client().await?;
        let now = Utc::now().timestamp_millis();
        
        client.execute(
            "UPDATE queue SET 
                status = $1,
                title = $2,
                local_path = $3,
                thumbnail_url = $4,
                message = $5,
                updated_at = $6
            WHERE id = $7",
            &[
                &status,
                &title,
                &local_path,
                &thumbnail_url,
                &message,
                &(now as i64),
                &id
            ]
        ).await?;
        
        Ok(())
    }
    
    pub async fn get_item_by_id(&self, id: &str) -> Result<Option<QueueItem>> {
        let client = self.get_client().await?;
        
        let rows = client.query(
            "SELECT id, url, status, message, title, filemoon_url, files_vc_url, 
                    encoding_progress, thumbnail_url, added_at, updated_at, local_path
             FROM queue 
             WHERE id = $1",
            &[&id]
        ).await?;
        
        if rows.is_empty() {
            return Ok(None);
        }
        
        let row = &rows[0];
        let item = QueueItem {
            id: Some(row.get::<_, String>(0)),
            url: row.get::<_, String>(1),
            status: row.get::<_, String>(2),
            message: row.get::<_, Option<String>>(3),
            title: row.get::<_, Option<String>>(4),
            filemoon_url: row.get::<_, Option<String>>(5),
            files_vc_url: row.get::<_, Option<String>>(6),
            encoding_progress: row.get::<_, Option<i32>>(7),
            thumbnail_url: row.get::<_, Option<String>>(8),
            added_at: Some(row.get::<_, i64>(9)),
            updated_at: Some(row.get::<_, i64>(10)),
            local_path: row.get::<_, Option<String>>(11),
        };
        
        Ok(Some(item))
    }
    
    pub async fn get_items_for_status_check(&self) -> Result<Vec<(String, String, String)>> {
        let client = self.get_client().await?;
        
        let rows = client.query(
            "SELECT q.id, q.filemoon_url, s.value 
             FROM queue q 
             JOIN settings s ON s.key = 'filemoon_api_key' 
             WHERE q.status IN ('transferring', 'encoding') AND q.filemoon_url IS NOT NULL",
            &[]
        ).await?;
        
        let mut items = Vec::with_capacity(rows.len());
        for row in rows {
            items.push((
                row.get::<_, String>(0), // id
                row.get::<_, String>(1), // filemoon_url (filecode)
                row.get::<_, String>(2), // api_key
            ));
        }
        
        Ok(items)
    }
    
    pub async fn update_item_encoding_details(
        &self,
        id: &str,
        status: &str,
        encoding_progress: Option<i32>,
        message: Option<String>,
    ) -> Result<()> {
        let client = self.get_client().await?;
        let now = Utc::now().timestamp_millis();
        
        client.execute(
            "UPDATE queue SET 
                status = $1,
                encoding_progress = $2,
                message = $3,
                updated_at = $4
            WHERE id = $5",
            &[
                &status,
                &encoding_progress,
                &message,
                &(now as i64),
                &id
            ]
        ).await?;
        
        Ok(())
    }
    
    pub async fn clear_items_by_status(&self, status_types: &[String]) -> Result<()> {
        if status_types.is_empty() {
            return Ok(());
        }
        
        let client = self.get_client().await?;
        
        // Delete items for each status type individually
        for status in status_types {
            client.execute(
                "DELETE FROM queue WHERE status = $1",
                &[&status.as_str()]
            ).await?;
        }
        
        Ok(())
    }
    
    // Method for manual import from a specific path - called via Tauri command
    pub async fn manual_import_from_path(&self, _path: &str) -> Result<()> {
        // Since we're now using Neon PostgreSQL, the SQLite import is no longer needed
        println!("Database import from file is no longer supported as the application now uses Neon PostgreSQL");
        println!("To migrate your data, please use the db:init:neon script instead");
        
        // Return success since this is now a no-op by design
        Ok(())
    }
} 