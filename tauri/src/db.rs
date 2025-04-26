use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

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
} 