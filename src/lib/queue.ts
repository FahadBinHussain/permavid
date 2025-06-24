import { db } from './db'; // <-- Import db from the new module
// import Database from 'better-sqlite3'; // <-- Remove old import
import path from 'path';
import fsPromises from 'fs/promises'; // Rename promise version
import fs from 'fs'; // Import standard fs for sync operations
import { execFile } from 'child_process';
import { promisify } from 'util';
import axios from 'axios'; // <-- Add axios
import FormData from 'form-data'; // <-- Add form-data
import { ChildProcess } from 'child_process'; // <-- Add import for ChildProcess
import { getSetting } from './settings'; // <-- Import getSetting

const execFileAsync = promisify(execFile);

// --- Configuration (Read from settings where applicable) ---
// const downloadDir = path.resolve(process.cwd(), 'downloads'); // <-- Now read from settings
// const DELETE_AFTER_UPLOAD = true; // <-- Now read from settings

// Function to get the current download directory from settings
function getCurrentDownloadDir(): string {
    // Use the setting, but fallback to a default if it's somehow unset or invalid
    const dirFromSettings = getSetting('download_directory');
    if (dirFromSettings && path.isAbsolute(dirFromSettings)) {
        return dirFromSettings;
    }
    console.warn('Download directory setting is missing or invalid, using default.');
    return path.resolve(process.cwd(), 'downloads'); // Fallback default
}

// Function to check if deletion is enabled
function shouldDeleteAfterUpload(): boolean {
    return getSetting('delete_after_upload', 'false') === 'true';
}

// Track active download processes by item ID
const activeDownloads = new Map<string, ChildProcess>();

// --- Database Setup ---
// let db: Database.Database; // <-- Remove old declaration
// --- Remove the entire try/catch block for DB initialization ---

// --- Initialize Queue Table and Perform Migrations (Using imported db) ---
try {
  // Create the queue table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'queued', 
      title TEXT,
      message TEXT, 
      local_path TEXT, 
      info_json_path TEXT, 
      filemoon_url TEXT, 
      files_vc_url TEXT, 
      encoding_progress INTEGER, 
      thumbnail_url TEXT, -- Add thumbnail URL column
      added_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // --- Schema Migration: Add files_vc_url if it doesn't exist ---
  try {
    const columns = db.pragma("table_info(queue)") as { name: string }[]; // Fetch columns info
    const hasFilesVcUrl = columns.some(col => col.name === 'files_vc_url');

    if (!hasFilesVcUrl) {
      console.log('Migrating database schema: Adding files_vc_url column to queue table...');
      db.exec('ALTER TABLE queue ADD COLUMN files_vc_url TEXT');
      console.log('Database schema migration successful.');
    }
  } catch (migrationError: any) {
    console.error('FATAL: Queue table schema migration (files_vc_url) failed!', migrationError);
    throw new Error(`Failed to migrate queue table schema: ${migrationError.message}`);
  }
  
  // --- Schema Migration: Add encoding_progress if it doesn't exist ---
  try {
    const columns = db.pragma("table_info(queue)") as { name: string }[];
    const hasEncodingProgress = columns.some(col => col.name === 'encoding_progress');

    if (!hasEncodingProgress) {
      console.log('Migrating database schema: Adding encoding_progress column to queue table...');
      db.exec('ALTER TABLE queue ADD COLUMN encoding_progress INTEGER');
      console.log('Database schema migration successful.');
    }
  } catch (migrationError: any) {
    console.error('FATAL: Queue table schema migration (encoding_progress) failed!', migrationError);
    throw new Error(`Failed to migrate queue table schema: ${migrationError.message}`);
  }
  
  // --- Schema Migration: Add thumbnail_url if it doesn't exist ---
  try {
    const columns = db.pragma("table_info(queue)") as { name: string }[]; // Re-fetch columns info
    const hasThumbnailUrl = columns.some(col => col.name === 'thumbnail_url');

    if (!hasThumbnailUrl) {
      console.log('Migrating database schema: Adding thumbnail_url column to queue table...');
      db.exec('ALTER TABLE queue ADD COLUMN thumbnail_url TEXT');
      console.log('Database schema migration successful.');
    }
  } catch (migrationError: any) {
    console.error('FATAL: Queue table schema migration (thumbnail_url) failed!', migrationError);
    throw new Error(`Failed to migrate queue table schema: ${migrationError.message}`);
  }
  // ------------------------------------------------------------------
  console.log('Queue table initialized/verified successfully.');

} catch (tableInitError) {
    console.error("------------------------------------------");
    console.error("FATAL: Could not initialize queue table!");
    console.error(tableInitError);
    console.error("------------------------------------------");
    // If the table fails, throw an error 
    throw new Error(`Failed to initialize queue table: ${tableInitError}`);
}

// --- Prepare Statements ---
// It's generally safer to prepare statements inside functions or classes
// where the db connection is confirmed, but for this module-level scope:
const stmtAddItem = db.prepare(
  'INSERT INTO queue (id, url, status, added_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(url) DO NOTHING'
);
const stmtGetQueue = db.prepare("SELECT * FROM queue WHERE status != 'encoded' ORDER BY added_at DESC");
const stmtGetNextQueued = db.prepare(
  "SELECT * FROM queue WHERE status = 'queued' ORDER BY added_at ASC LIMIT 1"
);
const stmtUpdateStatus = db.prepare(
  'UPDATE queue SET status = ?, message = ?, title = ?, local_path = ?, info_json_path = ?, updated_at = ? WHERE id = ?'
);
// More specific update for starting download
const stmtMarkDownloading = db.prepare(
    'UPDATE queue SET status = ?, message = ?, updated_at = ? WHERE id = ?'
);
// More specific update for starting upload (can reuse stmtMarkDownloading logic, or make specific)
const stmtMarkUploading = db.prepare(
    'UPDATE queue SET status = ?, message = ?, updated_at = ? WHERE id = ?' // Similar to downloading
);
// Add statement to update progress during upload
const stmtUpdateUploadProgress = db.prepare(
    'UPDATE queue SET message = ?, updated_at = ? WHERE id = ?'
);
// Update after successful upload
const stmtUpdateAfterUpload = db.prepare(
    'UPDATE queue SET status = ?, filemoon_url = ?, message = ?, updated_at = ? WHERE id = ?' // Store filecode in filemoon_url for now
);
// Add statement to update download progress (only message and updated_at)
const stmtUpdateDownloadProgress = db.prepare(
    'UPDATE queue SET message = ?, updated_at = ? WHERE id = ?'
);
const stmtClearCompleted = db.prepare("DELETE FROM queue WHERE status = 'completed'");
const stmtClearFailed = db.prepare("DELETE FROM queue WHERE status = 'failed' OR status = 'uploading'");
const stmtClearFinished = db.prepare("DELETE FROM queue WHERE status = 'completed' OR status = 'failed'");
// Add statement to get a specific item by ID
const stmtGetItemById = db.prepare('SELECT * FROM queue WHERE id = ?');
// Add statement to delete a specific item by ID
const stmtDeleteItemById = db.prepare('DELETE FROM queue WHERE id = ?');
// Add statement to clear cancelled items
const stmtClearCancelled = db.prepare("DELETE FROM queue WHERE status = 'cancelled'");
// Add statement to get items that have been uploaded but not yet encoded or failed during encoding
// Fetch current status and progress too, to avoid unnecessary updates
const stmtGetUploadedItemsToCheck = db.prepare("SELECT id, filemoon_url, status, encoding_progress FROM queue WHERE status = 'uploaded' OR status = 'encoding'");
// Add statement to update encoding progress and status
const stmtUpdateEncodingStatus = db.prepare(
    'UPDATE queue SET status = ?, encoding_progress = ?, message = ?, updated_at = ? WHERE id = ?'
);
// Add statement to fetch item by filecode (stored in filemoon_url)
const stmtGetItemByFilecode = db.prepare('SELECT * FROM queue WHERE filemoon_url = ?');

// Add statement to get items that have been uploaded/transferred but not yet encoded or failed during encoding
const stmtGetItemsToCheck = db.prepare(
    "SELECT id, filemoon_url, status, encoding_progress, updated_at FROM queue WHERE status = 'transferring' OR status = 'encoding'"
);

// Add this near the other prepared statement definitions
const stmtGetItemByUrl = db.prepare('SELECT id, status FROM queue WHERE url = ?');

// --- Queue Item Type (Matches DB) ---
export interface QueueItem {
    id: string;
    url: string;
    status: 'queued' | 'downloading' | 'completed' | 'failed' | 'uploading' | 'uploaded' | 'cancelled' | 'encoding' | 'encoded' | 'transferring';
    title?: string | null;
    message?: string | null;
    local_path?: string | null;
    info_json_path?: string | null;
    filemoon_url?: string | null; // Stores the filecode
    files_vc_url?: string | null; // Stores the Files.vc URL
    encoding_progress?: number | null;
    thumbnail_url?: string | null; // Store thumbnail URL
    added_at: number;
    updated_at: number;
}

// --- Queue Management Logic (using DB) ---

let isProcessing = false; // Still need this flag locally to prevent concurrent downloads

export function addToQueue(url: string): { success: boolean; message: string; item?: QueueItem } {
  const now = Date.now();
  const newItemId = now.toString() + Math.random().toString(36).substring(2, 9);
  try {
    const result = stmtAddItem.run(newItemId, url, 'queued', now, now);
    if (result.changes > 0) {
      console.log(`Added to queue DB: ${url} (ID: ${newItemId})`);
      triggerProcessing(); // Attempt to start processing
      const newItem = db.prepare('SELECT * FROM queue WHERE id = ?').get(newItemId) as QueueItem;
      return { success: true, message: 'URL added to queue', item: newItem };
    } else {
      // URL Conflict - Check the status of the existing item
      console.log(`URL already exists in queue, checking status: ${url}`);
      const existingItem = stmtGetItemByUrl.get(url) as { id: string; status: QueueItem['status'] } | undefined;

      let message = 'URL already exists in the queue.'; // Default message

      if (existingItem) {
          switch (existingItem.status) {
              case 'completed':
              case 'uploaded':
              case 'transferring':
              case 'encoding':
              case 'encoded':
                  message = 'This URL has already been processed or archived.';
                  break;
              case 'downloading':
              case 'uploading': // Added uploading here too
                  message = 'This URL is currently being processed.';
                  break;
              case 'queued':
                  message = 'This URL is already waiting in the queue.';
                  break;
              case 'failed':
                  message = 'This URL failed previously. You might want to retry it from the queue.';
                  break;
              case 'cancelled':
                  message = 'This URL was cancelled previously.';
                  break;
              default:
                  message = `This URL already exists with status: ${existingItem.status}.`;
                  break;
          }
          console.log(`Existing item found with status '${existingItem.status}'. Returning message: "${message}"`);
          // You could potentially return existingItem.id and existingItem.status here too
          // return { success: false, message: message, existingStatus: existingItem.status, existingId: existingItem.id };
          return { success: false, message: message }; // Keep it simple for now
      } else {
         // Should not happen if ON CONFLICT worked, but handle defensively
         console.warn(`URL conflict occurred for ${url}, but failed to retrieve the existing item details.`);
         return { success: false, message: 'URL already exists, but could not retrieve its status.' };
      }
    }
  } catch (error: any) {
    console.error(`Failed to add URL to queue DB: ${url}`, error);
    return { success: false, message: `Database error: ${error.message}` };
  }
}

export function getQueue(): QueueItem[] {
  try {
    // Use the prepared statement that already excludes encoded items
    return stmtGetQueue.all() as QueueItem[];
  } catch (error: any) {
    console.error('Failed to fetch queue from DB:', error);
    return []; // Return empty array on error
  }
}

// Generic update function - might be too broad, specific ones are better
/*
function updateQueueItem(
  id: string,
  status: QueueItem['status'],
  data: { message?: string; title?: string; local_path?: string; info_json_path?: string; }
) {
  try {
    stmtUpdateStatus.run(
      status,
      data.message ?? null, // Use null if undefined
      data.title ?? null,
      data.local_path ?? null,
      data.info_json_path ?? null,
      Date.now(),
      id
    );
    console.log(`Queue item ${id} updated in DB: Status=${status}, Title=${data.title ?? 'N/A'}`);
  } catch (error: any) {
     console.error(`Failed to update queue item ${id} in DB:`, error);
  }
}
*/

async function processQueue() {
  if (isProcessing) return;

  let itemToProcess: QueueItem | undefined;
  try {
    itemToProcess = stmtGetNextQueued.get() as QueueItem | undefined;
  } catch (error: any) {
    console.error('Failed to query next queued item:', error);
    isProcessing = false; // Allow trying again later
    return;
  }

  if (!itemToProcess) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const startTime = Date.now();
  const downloadDir = getCurrentDownloadDir(); // <-- Get current dir for this process
  const itemId = itemToProcess.id; // Get item ID for easier logging/use

  try {
    // Mark as downloading
    stmtMarkDownloading.run('downloading', 'Download starting...', startTime, itemId);
    console.log(`Processing item from DB: ${itemId} - ${itemToProcess.url} into ${downloadDir}`);

    // Start the download (pass the specific downloadDir)
    const downloadPromise = downloadVideo(itemToProcess, downloadDir);

    // Set up a cancellation check interval that runs every 500ms during download
    const cancellationCheckIntervalId = setInterval(() => {
      try {
        // Check if the item's status has changed to 'cancelled' during download
        const currentItem = stmtGetItemById.get(itemId) as QueueItem | undefined;

        if (currentItem && currentItem.status === 'cancelled') {
          console.log(`Item ${itemId} was cancelled during download. Terminating processes.`);

          // Kill all yt-dlp processes to be safe
          try {
            const { execSync } = require('child_process');
            execSync('taskkill /IM yt-dlp.exe /F /T', { encoding: 'utf8', stdio: 'pipe' });
            console.log('Terminated yt-dlp processes during cancellation check');
            
            // Also try to terminate any ffmpeg processes that might have been spawned
            try {
              execSync('taskkill /IM ffmpeg.exe /F /T', { encoding: 'utf8', stdio: 'pipe' });
              console.log('Terminated ffmpeg processes during cancellation check');
            } catch (ffmpegKillError) {
              // It's okay if this fails - there might not be any ffmpeg processes
              console.log('No ffmpeg processes found to terminate during cancellation');
            }
          } catch (killError) {
            console.error('Failed to terminate processes during cancellation:', killError);
          }

          // Clear the interval since we've detected cancellation
          clearInterval(cancellationCheckIntervalId);
          
          // Terminate active download process if we have a reference
          if (activeDownloads.has(itemId)) {
            try {
              const downloadProcess = activeDownloads.get(itemId);
              if (downloadProcess) {
                downloadProcess.kill('SIGKILL');
                console.log(`Sent SIGKILL to process for item ${itemId} during cancellation check`);
              }
              activeDownloads.delete(itemId);
            } catch (processKillError) {
              console.error(`Failed to kill process for ${itemId} during cancellation check:`, processKillError);
            }
          }
        }
      } catch (checkError) {
        console.error(`Error checking cancellation status for ${itemId}:`, checkError);
      }
    }, 500); // Check every 500ms for better responsiveness

    // Wait for download to complete
    const result = await downloadPromise;

    // Clear the cancellation check interval
    clearInterval(cancellationCheckIntervalId);

    // Check the item's current status to make sure it hasn't been cancelled during download
    const currentStatus = (stmtGetItemById.get(itemId) as QueueItem | undefined)?.status;

    // Only update or proceed if the item isn't cancelled
    if (currentStatus !== 'cancelled') {
      if (result.success) {
        console.log(`Download complete for item ${itemId}. Title: ${result.title}, Path: ${result.local_path}`);
        
        // VERIFY THAT WE HAVE A PATH
        if (!result.local_path) {
          console.error(`Item ${itemId}: No file path was found after successful download. Cannot proceed with auto-upload.`);
          
          // Update database with error but still mark as completed
          stmtUpdateStatus.run(
            'completed',
            'Download completed but no file path was found. Manual upload required.',
            result.title ?? itemToProcess.title ?? null,
            null, // No local path available
            result.info_json_path ?? null,
            Date.now(),
            itemId
          );
          
          console.log(`Item ${itemId}: Status updated to completed but flagged for manual upload.`);
        } else {
          // First verify that the file actually exists
          try {
            await fsPromises.access(result.local_path);
            console.log(`Item ${itemId}: Verified file exists at path: ${result.local_path}`);
            
            const autoUploadEnabled = getSetting('auto_upload', 'false') === 'true';

            if (autoUploadEnabled) {
              console.log(`Auto-upload enabled. Triggering upload for item ${itemId}...`);
              // Important: Store the necessary info before starting upload, as upload needs it
              // Update the item with title, path etc. before potentially calling upload
              stmtUpdateStatus.run(
                'completed', // Temporarily mark completed to save paths, upload will change it
                result.message ?? 'Download complete, preparing auto-upload...',
                result.title ?? itemToProcess.title ?? null,
                result.local_path, // Critical: explicitly use the path from download result
                result.info_json_path ?? null,
                Date.now(), // updated_at
                itemId
              );

              // Only upload to Filemoon
              uploadToFilemoon(itemId).catch(uploadError => {
                // Log error if the upload initiation fails, though uploadToFilemoon handles DB updates
                console.error(`Error initiating auto-upload to Filemoon for ${itemId}:`, uploadError);
              });
            } else {
              // Auto-upload is disabled, mark as completed
              console.log(`Auto-upload disabled. Marking item ${itemId} as completed.`);
              stmtUpdateStatus.run(
                'completed',
                result.message ?? 'Download complete.',
                result.title ?? itemToProcess.title ?? null,
                result.local_path, // Critical: explicitly use the path from download result
                result.info_json_path ?? null,
                Date.now(), // updated_at
                itemId
              );
              console.log(`Queue item ${itemId} update COMPLETE: Status=completed`);
            }
          } catch (accessError) {
            console.error(`Item ${itemId}: File reported by downloader does not exist at path: ${result.local_path}`);
            
            // Update database with warning but still mark as completed
            stmtUpdateStatus.run(
              'completed',
              `Download completed but file not found at reported path: ${result.local_path}. Manual upload required.`,
              result.title ?? itemToProcess.title ?? null,
              null, // Clear path since it's invalid
              result.info_json_path ?? null,
              Date.now(),
              itemId
            );
          }
        }
      } else {
        // Download failed
        console.log(`Download failed for item ${itemId}. Marking as failed.`);
        stmtUpdateStatus.run(
          'failed',
          result.message ?? 'Download failed.',
          result.title ?? itemToProcess.title ?? null, // Keep old title if available
          null, // Clear local path on failure
          itemToProcess.info_json_path, // Keep info json path if it exists? Or clear? Clear for now.
          Date.now(), // updated_at
          itemId
        );
        console.log(`Queue item ${itemId} update COMPLETE: Status=failed`);
      }
    } else {
      console.log(`Queue item ${itemId} was cancelled, not updating status after download attempt.`);
    }

  } catch (processingError: any) {
    // Catch errors during the update/processing itself
    console.error(`CRITICAL: Error processing queue item ${itemId}:`, processingError);

    // Check if the item has been cancelled before marking as failed
    const currentStatus = (stmtGetItemById.get(itemId) as QueueItem | undefined)?.status;
    if (currentStatus !== 'cancelled') {
      // Mark as failed in DB only if it wasn't cancelled
      try {
        stmtUpdateStatus.run('failed', `Processing error: ${processingError.message}`, itemToProcess.title, null, null, Date.now(), itemId);
      } catch (dbUpdateError) {
        console.error(`Failed to mark item ${itemId} as failed after processing error:`, dbUpdateError);
      }
    }
  } finally {
    isProcessing = false;
    // Use setImmediate to yield control and then check again, preventing tight loops
    setImmediate(processQueue);
  }
}

export function triggerProcessing() {
  setImmediate(() => {
    if (!isProcessing) {
      processQueue();
    }
  });
}

// Call triggerProcessing once on startup to handle any queued items from previous runs
triggerProcessing();

// --- Helper Functions (Download Logic - Modified to return paths) ---

interface DownloadResult {
    success: boolean;
    message: string;
    title?: string;
    local_path?: string; // Path to the final video file
    info_json_path?: string; // Path to the metadata file
}

async function ensureDirExists(dirPath: string) {
  try {
    // Use access() to check, catch error if not exists
    await fsPromises.access(dirPath);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Directory doesn't exist, create it
      await fsPromises.mkdir(dirPath, { recursive: true });
      console.log(`Created download directory: ${dirPath}`);
    } else {
      // Re-throw other errors (like permission errors)
      throw error;
    }
  }
}

function sanitizeFilename(name: string): string {
    if (!name) return 'untitled';
    // Remove potentially problematic characters for filenames, including leading/trailing dots/spaces
    // Replace sequences of invalid chars with single underscore
    return name.replace(/[\<>:\"\/\\|?*\s]+/g, '_') // Replace invalid chars and whitespace sequences with _
               .replace(/^[._]+|[._]+$/g, '') // Trim leading/trailing . or _
               .substring(0, 200); // Limit length
}

// Add this function before or near the downloadVideo function
function extractYouTubeVideoId(url: string): string | null {
    try {
        const urlObj = new URL(url);
        // Extract video ID from v parameter in query string (works for both youtube.com and music.youtube.com)
        if (urlObj.searchParams.has('v')) {
            return urlObj.searchParams.get('v');
        }
        
        // Handle youtu.be short URLs
        if (urlObj.hostname === 'youtu.be') {
            return urlObj.pathname.substring(1);
        }
        
        return null;
    } catch (error) {
        console.error(`Error extracting YouTube video ID from ${url}:`, error);
        return null;
    }
}

// Function to check if two URLs point to the same YouTube video
function isSameYouTubeVideo(url1: string, url2: string): boolean {
    // First try to extract video IDs
    const id1 = extractYouTubeVideoId(url1);
    const id2 = extractYouTubeVideoId(url2);
    
    // If both IDs were extracted and they match, it's the same video
    if (id1 && id2 && id1 === id2) {
        return true;
    }
    
    // Otherwise check for direct URL match
    return url1 === url2;
}

async function downloadVideo(item: QueueItem, downloadDir: string): Promise<DownloadResult> {
    let videoTitle = item.title || 'unknown_title';
    let infoJsonPath = '';
    let localVideoPath = '';
    let childProcess: ChildProcess | null = null;

    // Extract YouTube ID if it's a YouTube URL - do this first so we can use it throughout the function
    const youtubeId = (item.url.includes('youtube.com') || item.url.includes('youtu.be')) 
        ? extractYouTubeVideoId(item.url) 
        : null;

    if (youtubeId) {
        console.log(`Detected YouTube URL with ID: ${youtubeId || 'unknown'}`);
    }

    try {
        await ensureDirExists(downloadDir);

        // --- Get Title (if not already known) ---
        if (!item.title || item.title === 'unknown_title') {
            // Use ID in temp name to avoid collisions
            const tempOutputTemplate = path.join(downloadDir, `${item.id}_temp_title.%(ext)s`);
            const infoArgs = [item.url, '--get-title', '--output', tempOutputTemplate, '--encoding', 'utf-8'];
            try {
                // Use a shorter timeout for getting title
                const { stdout: titleOutput } = await execFileAsync('yt-dlp.exe', infoArgs, { timeout: 30000 }); // 30s timeout
                videoTitle = titleOutput.trim() || videoTitle;
                console.log(`Fetched title for ${item.url}: ${videoTitle}`);
            } catch (titleError: any) {
                console.error(`Failed to get title for ${item.url} (proceeding with '${videoTitle}'):`, titleError.stderr || titleError.message);
            }
        }

        // --- Prepare Filenames ---
        const safeTitle = sanitizeFilename(videoTitle);
        let finalOutputTemplate = '';
        
        // For YouTube videos, use the video ID in the filename to make it easier to find
        // This is especially important for YouTube Music URLs
        if (youtubeId) {
            // For YouTube, include ID in the filename
            finalOutputTemplate = path.join(downloadDir, `${youtubeId}.%(ext)s`);
            console.log(`Using YouTube ID for output template: ${finalOutputTemplate}`);
            
            // Also predict the info.json path using the ID
            infoJsonPath = path.join(downloadDir, `${youtubeId}.info.json`);
        } else {
            // For non-YouTube, use the safe title
            finalOutputTemplate = path.join(downloadDir, `${safeTitle}.%(ext)s`);
            // Predict info.json path based on the sanitized title
            infoJsonPath = path.join(downloadDir, `${safeTitle}.info.json`);
        }

        // --- Execute Download ---
        const args = [
            item.url,
            '--write-info-json', // Keep metadata
            '--output', finalOutputTemplate,
            // Add other args back if needed:
            // '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            // '--ffmpeg-location', process.env.FFMPEG_PATH || 'ffmpeg',
            // '--no-warnings',
            '--progress',
            '--newline'
        ];

        console.log(`Executing download: yt-dlp.exe ${args.join(' ')}`);
        
        let lastProgressUpdate = 0;
        const progressUpdateInterval = 1500; // Update DB max every 1.5 seconds
        let latestPercent = 0; // Store latest parsed percentage

        childProcess = execFile('yt-dlp.exe', args, { 
            timeout: 1800000, // Keep 30 min timeout
            encoding: 'utf-8', // Important for reading stdout
            maxBuffer: 10 * 1024 * 1024 // Increase buffer size (e.g., 10MB) for potentially verbose output
        });

        // Store the child process for potential cancellation
        activeDownloads.set(item.id, childProcess);

        // --- Listen to stdout for progress and file path --- 
        childProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            console.log('yt-dlp stdout chunk:', output); // Log all stdout for debugging

            // Regex to find download percentage
            const progressMatch = output.match(/\[download\]\s+([0-9.]+)\%/);
            if (progressMatch && progressMatch[1]) {
                const currentPercent = parseFloat(progressMatch[1]);
                latestPercent = Math.max(latestPercent, currentPercent);

                // Throttle DB updates
                const now = Date.now();
                if (now - lastProgressUpdate > progressUpdateInterval) {
                    const progressMessage = `Downloading: ${Math.floor(latestPercent)}%`;
                    try {
                        stmtUpdateDownloadProgress.run(progressMessage, now, item.id);
                        lastProgressUpdate = now;
                    } catch (dbError) {
                        console.error(`Item ${item.id}: Failed to update download progress in DB:`, dbError);
                    }
                }
            }

            // ADDED: Capture destination filename from output
            const destFileMatch = output.match(/\[download\] Destination:\s+(.+?)$/m);
            if (destFileMatch && destFileMatch[1]) {
                const detectedPath = destFileMatch[1].trim();
                console.log(`Item ${item.id}: Detected download path: ${detectedPath}`);
                
                if (fs.existsSync(detectedPath)) {
                    localVideoPath = detectedPath;
                    console.log(`Item ${item.id}: Verified destination path exists: ${localVideoPath}`);
                }
            }
            
            // ADDED: Also look for "Merging formats into" which gives the final file path
            const mergingMatch = output.match(/\[Merger\] Merging formats into\s+"(.+?)"/i);
            if (mergingMatch && mergingMatch[1]) {
                const mergedPath = mergingMatch[1].trim();
                console.log(`Item ${item.id}: Detected merged file path: ${mergedPath}`);
                
                if (fs.existsSync(mergedPath)) {
                    localVideoPath = mergedPath;
                    console.log(`Item ${item.id}: Verified merged file path exists: ${localVideoPath}`);
                }
            }
        });

        // --- Listen to stderr for errors --- 
        childProcess.stderr?.on('data', (data) => {
             console.error(`yt-dlp stderr for ${item.id}:`, data.toString());
            // Don't reject here, wait for the exit code
        });

        // --- Return a new Promise that resolves/rejects based on process exit --- 
        return new Promise((resolve, reject) => {
            childProcess?.on('close', (code) => {
                // Remove this process from activeDownloads when it exits
                activeDownloads.delete(item.id);

                if (code === 0) {
                    // Process finished successfully, now verify files
                    console.log(`yt-dlp process for ${item.id} finished successfully (code 0). Verifying files...`);
                    (async () => {
                        try {
                             // Ensure 100% is logged if process completes successfully
                             if(latestPercent < 100) {
                                stmtUpdateDownloadProgress.run(`Downloading: 100%`, Date.now(), item.id);
                             }

                            // For YouTube videos, directly try the paths with the video ID first
                            if (youtubeId) {
                                console.log(`Item ${item.id}: Checking for paths with YouTube ID ${youtubeId}`);
                                
                                // Common extensions to try
                                const extensions = ['mp4', 'webm', 'mkv', 'mp3', 'm4a'];
                                
                                for (const ext of extensions) {
                                    const idPath = path.join(downloadDir, `${youtubeId}.${ext}`);
                                    try {
                                        await fsPromises.access(idPath);
                                        console.log(`Item ${item.id}: Found file with YouTube ID: ${idPath}`);
                                        localVideoPath = idPath;
                                        break;
                                    } catch (error) {
                                        // Continue to next extension
                                    }
                                }
                                
                                // Also check for the info.json
                                const idInfoPath = path.join(downloadDir, `${youtubeId}.info.json`);
                                try {
                                    await fsPromises.access(idInfoPath);
                                    console.log(`Item ${item.id}: Found info.json with YouTube ID: ${idInfoPath}`);
                                    infoJsonPath = idInfoPath;
                                } catch (error) {
                                    // Continue with other strategies
                                }
                            }

                            // If we already found the path, skip the other checks
                            if (localVideoPath && fs.existsSync(localVideoPath)) {
                                console.log(`Item ${item.id}: Using already detected path: ${localVideoPath}`);
                                return resolve({ 
                                    success: true, 
                                    message: `Download complete: ${path.basename(localVideoPath)}`, 
                                    title: videoTitle, 
                                    local_path: localVideoPath, 
                                    info_json_path: infoJsonPath || undefined 
                                });
                            }

                            // Check if the predicted info.json exists
                            try {
                                await fsPromises.access(infoJsonPath);
                                console.log(`Found info.json: ${infoJsonPath}`);
                            } catch (e) {
                                console.warn(`Could not find expected info.json file: ${infoJsonPath}`);
                                
                                // Try to find any .info.json file in the directory
                                const files = await fsPromises.readdir(downloadDir);
                                const infoJsonFiles = files.filter(f => f.endsWith('.info.json'));
                                if (infoJsonFiles.length > 0) {
                                    // Use the most recently modified info.json file
                                    const infoJsonStats = await Promise.all(
                                        infoJsonFiles.map(async (file) => {
                                            const filePath = path.join(downloadDir, file);
                                            const stats = await fsPromises.stat(filePath);
                                            return { file, stats };
                                        })
                                    );
                                    infoJsonStats.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
                                    infoJsonPath = path.join(downloadDir, infoJsonStats[0].file);
                                    console.log(`Found alternative info.json: ${infoJsonPath}`);
                                } else {
                                    infoJsonPath = ''; // Reset path if not found
                                }
                            }

                            // Read the JSON and try to extract video ID for YouTube URLs
                            let matchedBasedOnJson = false;
                            if (infoJsonPath && (item.url.includes('youtube.com') || item.url.includes('youtu.be'))) {
                                try {
                                    const jsonContent = await fsPromises.readFile(infoJsonPath, 'utf8');
                                    const info = JSON.parse(jsonContent);
                                    const jsonUrl = info.webpage_url || info.original_url;
                                    
                                    if (jsonUrl) {
                                        const isMatch = isSameYouTubeVideo(item.url, jsonUrl);
                                        console.log(`YouTube URL comparison: Original=${item.url} JSON=${jsonUrl} Match=${isMatch}`);
                                        
                                        if (isMatch) {
                                            matchedBasedOnJson = true;
                                            
                                            // If the JSON has _filename field, use it directly
                                            if (info._filename) {
                                                let filename = info._filename;
                                                // If it's a relative path, make it absolute
                                                if (!path.isAbsolute(filename)) {
                                                    filename = path.join(downloadDir, filename);
                                                }
                                                
                                                if (await fsPromises.stat(filename).catch(() => null)) {
                                                    localVideoPath = filename;
                                                    console.log(`Found video file from JSON _filename: ${localVideoPath}`);
                                                }
                                            }
                                            
                                            // If the JSON has a specific extension, look for file with video ID and that extension
                                            if (!localVideoPath && info.ext) {
                                                const videoId = extractYouTubeVideoId(jsonUrl) || youtubeId;
                                                if (videoId) {
                                                    const potentialFile = path.join(downloadDir, `${videoId}.${info.ext}`);
                                                    if (await fsPromises.stat(potentialFile).catch(() => null)) {
                                                        localVideoPath = potentialFile;
                                                        console.log(`Found video file using video ID and extension: ${localVideoPath}`);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } catch (jsonError) {
                                    console.error(`Error processing JSON file ${infoJsonPath}:`, jsonError);
                                }
                            }

                            // If we already have a valid localVideoPath from stdout capture or JSON, use it
                            if (localVideoPath && fs.existsSync(localVideoPath)) {
                                console.log(`Using video path: ${localVideoPath}`);
                                return resolve({ 
                                    success: true, 
                                    message: `Download complete: ${path.basename(localVideoPath)}`, 
                                    title: videoTitle, 
                                    local_path: localVideoPath, 
                                    info_json_path: infoJsonPath || undefined 
                                });
                            }

                            // Find the actual video file
                            const files = await fsPromises.readdir(downloadDir);
                            
                            // Log all files in the directory for debugging
                            console.log(`Files in ${downloadDir}:`, files);
                            
                            // For YouTube URLs, look for file with video ID in name
                            let videoFile: string | undefined;
                            
                            if (youtubeId) {
                                console.log(`Looking for file matching YouTube ID: ${youtubeId}`);
                                videoFile = files.find(f => 
                                    f.includes(youtubeId) && 
                                    !f.endsWith('.info.json') && 
                                    !f.endsWith('.part')
                                );
                                
                                if (videoFile) {
                                    console.log(`Found file matching YouTube ID: ${videoFile}`);
                                }
                            }
                            
                            // If no YouTube ID match, try safe title match
                            if (!videoFile) {
                                // Try to find a file with the exact safe title
                                videoFile = files.find(f => f.startsWith(safeTitle) && !f.endsWith('.info.json'));
                                
                                if (videoFile) {
                                    console.log(`Found file matching safe title: ${videoFile}`);
                                }
                            }
                            
                            // If still not found, try using the most recently modified video file
                            if (!videoFile) {
                                // Sort files by modification time (newest first) to prioritize the recent download
                                const fileStats = await Promise.all(
                                    files.filter(f => !f.endsWith('.info.json') && !f.endsWith('.part'))
                                         .map(async f => {
                                             const filePath = path.join(downloadDir, f);
                                             const stats = await fsPromises.stat(filePath);
                                             return { file: f, stats };
                                         })
                                );
                                fileStats.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
                                
                                if (fileStats.length > 0) {
                                    videoFile = fileStats[0].file;
                                    console.log(`Using most recent file: ${videoFile}`);
                                }
                            }

                            if (!videoFile && !infoJsonPath) {
                                console.error(`Download finished but no video or info.json file found in ${downloadDir}`);
                                return reject(new Error('Download finished successfully (code 0), but no video or info.json file found.'));
                            } else if (!videoFile && infoJsonPath) {
                                console.warn(`Video file not found, but info.json exists.`);
                                return resolve({ success: true, message: 'Metadata downloaded, video file missing/failed.', title: videoTitle, local_path: undefined, info_json_path: infoJsonPath });
                            } else if (videoFile) {
                                localVideoPath = path.join(downloadDir, videoFile);
                                console.log(`Found video file: ${localVideoPath}`);
                                return resolve({ success: true, message: `Download complete: ${videoFile}`, title: videoTitle, local_path: localVideoPath || undefined, info_json_path: infoJsonPath || undefined });
                            }
                        } catch (verifyError) {
                            console.error(`Error verifying files after download: ${verifyError}`);
                            reject(verifyError);
                        }
                    })();
                } else {
                    // Process exited with an error code
                    console.error(`yt-dlp process for ${item.id} exited with code ${code}.`);
                    // Relying on the 'killed' signal check might be better
                    reject(new Error(`yt-dlp process exited with error code ${code}. Check stderr logs.`));
                }
            });

            // Handle process errors (e.g., command not found)
            childProcess?.on('error', (err) => {
                activeDownloads.delete(item.id);
                console.error(`Failed to start yt-dlp process for ${item.id}:`, err);
                reject(err); // Reject the promise on process error
            });

            // Check for manual cancellation via kill signal
            childProcess?.on('exit', (code, signal) => {
                 if (signal === 'SIGKILL' || signal === 'SIGTERM') {
                    console.log(`Download process for ${item.id} was killed by signal: ${signal}.`);
                    activeDownloads.delete(item.id); // Ensure removal
                    // Resolve with failure, indicating cancellation
                    resolve({
                        success: false,
                        message: 'Download cancelled by user.',
                        title: videoTitle
                    });
                 }
            });
        });

    } catch (downloadError: any) {
        // Always make sure to remove from active downloads when erroring
        activeDownloads.delete(item.id);
        
        console.error(`Failed yt-dlp execution for ${item.url}:`, downloadError);
        let errorMessage = downloadError.stderr || downloadError.stdout || downloadError.message || 'Unknown download error';
        if (downloadError.code === 'ENOENT') {
            errorMessage = `Could not find 'yt-dlp.exe' or 'ffmpeg'. Ensure they are installed and in PATH or bundled. (${errorMessage})`;
        } else if (downloadError.signal === 'SIGTERM') {
            errorMessage = 'Download timed out after 30 minutes.';
        }
        // Return failure but include title if we managed to get it
        return { success: false, message: errorMessage, title: videoTitle !== 'unknown_title' ? videoTitle : undefined };
    }
}

// --- Filemoon Upload Logic (Use settings) ---

export async function uploadToFilemoon(itemId: string): Promise<{ success: boolean, message: string, filecode?: string }> {
    console.log(`Starting fresh upload process for item ${itemId}`);
    
    // ---- 1. Initial validation ----
    // Check API key
    const apiKey = getSetting('filemoon_api_key');
    if (!apiKey) {
        console.error(`Item ${itemId}: Upload failed - Filemoon API key not found in settings`);
        return { success: false, message: 'Upload failed: Filemoon API key is missing in settings.' };
    }

    // Fetch item from database
    let item: QueueItem | undefined;
    try {
        item = stmtGetItemById.get(itemId) as QueueItem | undefined;
        if (!item) {
            console.error(`Item ${itemId}: Upload failed - Item not found in database`);
            return { success: false, message: `Upload failed: Item with ID ${itemId} not found.` };
        }
        
        console.log(`Item ${itemId}: Retrieved from database`, JSON.stringify({
            id: item.id,
            status: item.status,
            title: item.title,
            local_path: item.local_path,
            url: item.url
        }));
    } catch (dbError: any) {
        console.error(`Item ${itemId}: Database error during retrieval`, dbError);
        return { success: false, message: `Database error retrieving item: ${dbError.message}` };
    }

    // Check item status
    if (item.status !== 'completed' && item.status !== 'encoded') {
        console.error(`Item ${itemId}: Wrong status for upload - ${item.status}`);
        return { success: false, message: `Upload failed: Item ${itemId} is not in 'completed' or 'encoded' state (current: ${item.status}).` };
    }
    
    // ---- 2. Find upload file path ----
    let uploadFilePath: string | null = null;
    const downloadDir = getCurrentDownloadDir();
    const videoFileName = item.local_path ? path.basename(item.local_path) : null;
    
    console.log(`Item ${itemId}: Starting file path determination process`);
    console.log(`Item ${itemId}: Download directory is ${downloadDir}`);
    console.log(`Item ${itemId}: Stored path is ${item.local_path || 'missing'}`);
    
    // Try multiple strategies to find the file
    
    // Strategy 1: Check if the stored path exists directly
    if (item.local_path) {
        console.log(`Item ${itemId}: Checking if stored path exists: ${item.local_path}`);
        try {
            await fsPromises.access(item.local_path);
            console.log(`Item ${itemId}: ✓ Stored path exists and is accessible`);
            uploadFilePath = item.local_path;
        } catch (error) {
            console.log(`Item ${itemId}: ✗ Stored path doesn't exist or isn't accessible`);
        }
    }
    
    // Strategy 2: If we have filename but different path, try to find it in download directory
    if (!uploadFilePath && videoFileName) {
        const potentialPath = path.join(downloadDir, videoFileName);
        console.log(`Item ${itemId}: Checking if file exists in download directory: ${potentialPath}`);
        
        try {
            await fsPromises.access(potentialPath);
            console.log(`Item ${itemId}: ✓ Found file in download directory`);
            uploadFilePath = potentialPath;
        } catch (error) {
            console.log(`Item ${itemId}: ✗ File not found in download directory`);
        }
    }

    // Strategy 3: For YouTube URLs, extract video ID and try direct filename approach
    if (!uploadFilePath && (item.url.includes('youtube.com') || item.url.includes('youtu.be'))) {
        const youtubeId = extractYouTubeVideoId(item.url);
        if (youtubeId) {
            console.log(`Item ${itemId}: Extracted YouTube video ID: ${youtubeId}`);
            
            // DIRECT STRATEGY: Try common video extensions with just the ID as filename
            const commonExtensions = ['mp4', 'webm', 'mkv'];
            for (const ext of commonExtensions) {
                const idPath = path.join(downloadDir, `${youtubeId}.${ext}`);
                console.log(`Item ${itemId}: Checking for simple ID path: ${idPath}`);
                
                try {
                    await fsPromises.access(idPath);
                    console.log(`Item ${itemId}: ✓ Found file using direct ID path: ${idPath}`);
                    uploadFilePath = idPath;
                    break;
                } catch (error) {
                    // Continue to next extension
                }
            }
            
            // If still not found, look for files containing the ID
            if (!uploadFilePath) {
                try {
                    const files = await fsPromises.readdir(downloadDir);
                    
                    // Find any file containing the YouTube ID (not just starting with it)
                    const matchingFiles = files.filter(file => 
                        file.includes(youtubeId) && 
                        !file.endsWith('.info.json') && 
                        !file.endsWith('.part')
                    );
                    
                    if (matchingFiles.length > 0) {
                        // Sort by modification time (newest first)
                        const fileDetails = await Promise.all(
                            matchingFiles.map(async file => {
                                const filePath = path.join(downloadDir, file);
                                const stats = await fsPromises.stat(filePath);
                                return { 
                                    filePath,
                                    fileName: file,
                                    modifiedTime: stats.mtime.getTime(),
                                    size: stats.size
                                };
                            })
                        );
                        
                        fileDetails.sort((a, b) => b.modifiedTime - a.modifiedTime);
                        uploadFilePath = fileDetails[0].filePath;
                        console.log(`Item ${itemId}: ✓ Found file matching YouTube ID: ${uploadFilePath}`);
                    }
                } catch (error) {
                    console.error(`Item ${itemId}: ✗ Error searching for YouTube files:`, error);
                }
            }
        }
    }
    
    // Strategy 4: Find any .info.json file, read it and match content with URL
    if (!uploadFilePath) {
        console.log(`Item ${itemId}: Looking for matching .info.json files in ${downloadDir}`);
        try {
            const files = await fsPromises.readdir(downloadDir);
            const infoJsonFiles = files.filter(f => f.endsWith('.info.json'));
            
            // Check each info.json file
            for (const infoFile of infoJsonFiles) {
                const infoPath = path.join(downloadDir, infoFile);
                try {
                    const content = await fsPromises.readFile(infoPath, 'utf-8');
                    const info = JSON.parse(content);
                    
                    // Extract the URL from the info.json file
                    const jsonUrl = info.webpage_url || info.original_url;
                    
                    if (jsonUrl) {
                        const isMatch = item.url.includes('youtube.com') || item.url.includes('youtu.be') || jsonUrl.includes('youtube.com') || jsonUrl.includes('youtu.be')
                            ? isSameYouTubeVideo(item.url, jsonUrl)
                            : item.url === jsonUrl;
                            
                        console.log(`Item ${itemId}: Comparing URLs - Original: ${item.url}, JSON: ${jsonUrl}, Match: ${isMatch}`);
                        
                        if (isMatch) {
                            // Try to find the video file using the base name of the info.json file
                            const baseName = infoFile.replace('.info.json', '');
                            const videoFiles = files.filter(f => 
                                f.startsWith(baseName) && 
                                f !== infoFile && 
                                !f.endsWith('.part')
                            );
                            
                            if (videoFiles.length > 0) {
                                uploadFilePath = path.join(downloadDir, videoFiles[0]);
                                console.log(`Item ${itemId}: ✓ Found matching video file via info.json: ${uploadFilePath}`);
                                break;
                            }
                            
                            // If no direct match, try using the id from the .info.json file
                            if (info.id && info.ext) {
                                const potentialFile = path.join(downloadDir, `${info.id}.${info.ext}`);
                                if (files.includes(`${info.id}.${info.ext}`)) {
                                    uploadFilePath = potentialFile;
                                    console.log(`Item ${itemId}: ✓ Found matching video file using ID from info.json: ${uploadFilePath}`);
                                    break;
                                }
                            }
                        }
                    }
                } catch (jsonError) {
                    console.error(`Item ${itemId}: Error processing JSON file ${infoPath}:`, jsonError);
                }
            }
        } catch (error) {
            console.error(`Item ${itemId}: Error searching for info.json files:`, error);
        }
    }
    
    // Strategy 5: Last resort - find most recently modified video file in download directory
    if (!uploadFilePath) {
        console.log(`Item ${itemId}: Looking for most recent video file in ${downloadDir}`);
        try {
            // Get list of files in download directory
            const files = await fsPromises.readdir(downloadDir);
            console.log(`Item ${itemId}: Found ${files.length} files in download directory`);
            
            // Filter out non-video files (very basic approach)
            const potentialVideoFiles = files.filter(file => 
                !file.endsWith('.part') && 
                !file.endsWith('.info.json') && 
                !file.endsWith('.txt') && 
                !file.endsWith('.log')
            );
            
            if (potentialVideoFiles.length > 0) {
                // Get details of each file
                const fileDetails = await Promise.all(potentialVideoFiles.map(async file => {
                    const filePath = path.join(downloadDir, file);
                    const stats = await fsPromises.stat(filePath);
                    return { 
                        filePath,
                        fileName: file,
                        modifiedTime: stats.mtime.getTime(),
                        size: stats.size
                    };
                }));
                
                // Sort by modified time (newest first)
                fileDetails.sort((a, b) => b.modifiedTime - a.modifiedTime);
                
                if (fileDetails.length > 0) {
                    // Take the most recently modified file
                    uploadFilePath = fileDetails[0].filePath;
                    console.log(`Item ${itemId}: ✓ Found most recent file: ${uploadFilePath} (modified: ${new Date(fileDetails[0].modifiedTime).toISOString()}, size: ${fileDetails[0].size} bytes)`);
                }
            } else {
                console.log(`Item ${itemId}: ✗ No potential video files found in directory`);
            }
        } catch (error) {
            console.error(`Item ${itemId}: Error while searching for video files:`, error);
        }
    }
    
    // Strategy 6: EXTREME FALLBACK for YouTube - Just use the YouTube ID directly
    if (!uploadFilePath && (item.url.includes('youtube.com') || item.url.includes('youtu.be'))) {
        const youtubeId = extractYouTubeVideoId(item.url);
        if (youtubeId) {
            console.log(`Item ${itemId}: LAST RESORT - Using YouTube ID to construct a path`);
            
            // Common video file extensions to try
            const extensions = ['mp4', 'webm', 'mkv', 'mp3', 'm4a'];
            
            // First check if any such file exists
            for (const ext of extensions) {
                const constructedPath = path.join(downloadDir, `${youtubeId}.${ext}`);
                try {
                    await fsPromises.access(constructedPath);
                    console.log(`Item ${itemId}: ✓ Found file at constructed path: ${constructedPath}`);
                    uploadFilePath = constructedPath;
                    break;
                } catch (error) {
                    // Continue to next extension
                }
            }
            
            // If no file exists, use mp4 as default and hope it will be found or created
            if (!uploadFilePath) {
                uploadFilePath = path.join(downloadDir, `${youtubeId}.mp4`);
                console.log(`Item ${itemId}: ⚠️ No file found, using constructed path as fallback: ${uploadFilePath}`);
                
                // Try to create an empty file to ensure path is valid for upload
                try {
                    fs.writeFileSync(uploadFilePath, '');
                    console.log(`Item ${itemId}: Created empty file placeholder at ${uploadFilePath}`);
                    console.log(`Item ${itemId}: ⚠️ WARNING: This is a last resort measure and may not work properly.`);
                } catch (error) {
                    console.error(`Item ${itemId}: Failed to create placeholder file:`, error);
                }
            }
        }
    }
    
    // Fail if we couldn't find a file to upload
    if (!uploadFilePath) {
        console.error(`Item ${itemId}: Could not find a valid file to upload`);
        try {
            stmtUpdateStatus.run('failed', 'Upload failed: Could not find a valid file to upload', item.title, item.local_path, item.info_json_path, Date.now(), item.id);
        } catch (dbError) {
            console.error(`Item ${itemId}: Failed to update status after file not found:`, dbError);
        }
        return { success: false, message: 'Upload failed: Could not find a valid file to upload.' };
    }
    
    // Update database with the confirmed file path if it's different from what's stored
    if (uploadFilePath !== item.local_path) {
        console.log(`Item ${itemId}: Updating database with confirmed file path: ${uploadFilePath}`);
        try {
            stmtUpdateStatus.run(item.status, `Found valid file path: ${uploadFilePath}`, item.title, uploadFilePath, item.info_json_path, Date.now(), item.id);
            // Update our local copy too
            item.local_path = uploadFilePath;
        } catch (dbError) {
            console.error(`Item ${itemId}: Failed to update database with new file path:`, dbError);
            // Continue anyway, since we have the correct path in memory
        }
    }
    
    // ---- 3. Start upload process ----
    console.log(`Item ${itemId}: Starting upload process with file: ${uploadFilePath}`);
    
    try {
        // Update status to uploading
        try {
            stmtMarkUploading.run('uploading', 'Starting Filemoon upload...', Date.now(), item.id);
            console.log(`Item ${itemId}: Updated status to uploading`);
        } catch (dbError) {
            console.error(`Item ${itemId}: Failed to update status to uploading:`, dbError);
            // Continue anyway as this is non-fatal
        }
        
        // Get file details
        const fileStats = await fsPromises.stat(uploadFilePath);
        const fileName = path.basename(uploadFilePath);
        console.log(`Item ${itemId}: File details: name=${fileName}, size=${fileStats.size} bytes`);
        
        // Get upload server URL
        console.log(`Item ${itemId}: Requesting Filemoon upload server...`);
        const serverResponse = await axios.get(`https://filemoonapi.com/api/upload/server?key=${apiKey}`);
        
        if (!serverResponse.data || serverResponse.data.status !== 200 || !serverResponse.data.result) {
            throw new Error(`Failed to get upload server: Status ${serverResponse.data?.status || 'unknown'}, Message: ${serverResponse.data?.msg || 'No response data'}`);
        }
        
        const uploadUrl = serverResponse.data.result;
        console.log(`Item ${itemId}: Received upload server URL: ${uploadUrl}`);
        
        // Create form data with file
        console.log(`Item ${itemId}: Creating form data with file stream`);
        const formData = new FormData();
        formData.append('key', apiKey);
        
        // Create a readable stream from the file
        const fileStream = fs.createReadStream(uploadFilePath);
        formData.append('file', fileStream, fileName);
        
        // Upload with progress tracking (if possible)
        console.log(`Item ${itemId}: Starting upload to ${uploadUrl}`);
        const uploadStart = Date.now();
        
        const uploadResponse = await axios.post(uploadUrl, formData, {
            headers: formData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        const uploadDuration = Math.round((Date.now() - uploadStart) / 1000); // in seconds
        console.log(`Item ${itemId}: Upload completed in ${uploadDuration} seconds`);
        console.log(`Item ${itemId}: Upload response status: ${uploadResponse.status}`);

        // Process response
        if (!uploadResponse.data || 
            uploadResponse.data.status !== 200 || 
            !uploadResponse.data.files || 
            !Array.isArray(uploadResponse.data.files) || 
            uploadResponse.data.files.length === 0) {
            
            throw new Error(`Invalid response from server: ${JSON.stringify(uploadResponse.data)}`);
        }
        
        const uploadedFile = uploadResponse.data.files[0];
        console.log(`Item ${itemId}: Upload response file data:`, JSON.stringify(uploadedFile));
        
        if (!uploadedFile.filecode || uploadedFile.status !== 'OK') {
            throw new Error(`Upload completed but file status not OK: ${uploadedFile.status}, Code: ${uploadedFile.filecode || 'missing'}`);
        }
        
        const filecode = uploadedFile.filecode;
        const filemoonUrl = `https://filemoon.to/d/${filecode}`;
        console.log(`Item ${itemId}: Upload successful! Filecode: ${filecode}, URL: ${filemoonUrl}`);
        
        // Update database with successful upload
        try {
            stmtUpdateAfterUpload.run('transferring', filecode, `Upload successful. Waiting for transfer/encoding...`, Date.now(), item.id);
            console.log(`Item ${itemId}: Updated database status to transferring`);
        } catch (dbError) {
            console.error(`Item ${itemId}: Failed to update database after successful upload:`, dbError);
            // Continue anyway as the upload was successful
        }
        
        // Handle file deletion if setting enabled
        if (shouldDeleteAfterUpload()) {
            console.log(`Item ${itemId}: Auto-delete enabled, removing local file`);
            try {
                await fsPromises.unlink(uploadFilePath);
                console.log(`Item ${itemId}: Successfully deleted local file: ${uploadFilePath}`);
                
                // Also try to delete info.json if it exists
                if (item.info_json_path) {
                    try {
                       await fsPromises.access(item.info_json_path);
                       await fsPromises.unlink(item.info_json_path);
                        console.log(`Item ${itemId}: Successfully deleted info.json: ${item.info_json_path}`);
                    } catch (error) {
                        console.log(`Item ${itemId}: Could not delete info.json (may not exist): ${item.info_json_path}`);
                    }
                }
            } catch (deleteError) {
                console.error(`Item ${itemId}: Failed to delete local file after upload:`, deleteError);
                // Non-fatal error, continue
            }
        }
        
        // Return success
        return { 
            success: true, 
            message: `Upload successful! Filecode: ${filecode}. File will be processed by Filemoon shortly.`, 
            filecode 
        };
        
    } catch (error: any) {
        // Comprehensive error handling
        console.error(`Item ${itemId}: Upload failed:`, error);
        
        // Extract most useful error message
        let errorMessage = 'Filemoon upload failed with unknown error.';
        
        if (axios.isAxiosError(error)) {
            if (error.response) {
                errorMessage = `Filemoon API error (${error.response.status}): ${
                    error.response.data?.msg || error.response.statusText || error.message
                }`;
                console.error(`Item ${itemId}: Response data:`, JSON.stringify(error.response.data));
            } else if (error.request) {
                errorMessage = `Network error during upload: ${error.message}`;
            } else {
                errorMessage = `Request setup error: ${error.message}`;
            }
        } else if (error instanceof Error) {
            errorMessage = `Upload error: ${error.message}`;
        }
        
        // Update database with failure
        try {
             stmtUpdateStatus.run('failed', errorMessage, item.title, item.local_path, item.info_json_path, Date.now(), item.id);
            console.log(`Item ${itemId}: Updated status to failed in database`);
        } catch (dbError) {
            console.error(`Item ${itemId}: Failed to update status to failed:`, dbError);
        }

        return { success: false, message: errorMessage };
    }
}

// --- REMOVED: Files.vc Upload Logic ---
// Files.vc integration has been temporarily disabled.
// The uploadToFilesVC function has been removed.

// --- New Clear Functions ---

export function clearCompleted(): { success: boolean; count: number; message: string } {
  try {
    const result = stmtClearCompleted.run();
    console.log(`Cleared ${result.changes} completed items from DB.`);
    return { success: true, count: result.changes, message: `Cleared ${result.changes} completed items.` };
  } catch (error: any) {
    console.error('Failed to clear completed items:', error);
    return { success: false, count: 0, message: `Database error: ${error.message}` };
  }
}

export function clearFailed(): { success: boolean; count: number; message: string } {
  try {
    const result = stmtClearFailed.run();
    console.log(`Cleared ${result.changes} failed or stuck uploading items from DB.`);
    return { success: true, count: result.changes, message: `Cleared ${result.changes} failed/uploading items.` };
  } catch (error: any) {
    console.error('Failed to clear failed/uploading items:', error);
    return { success: false, count: 0, message: `Database error: ${error.message}` };
  }
}

export function clearFinished(): { success: boolean; count: number; message: string } {
  try {
    const result = stmtClearFinished.run();
    console.log(`Cleared ${result.changes} completed and failed items from DB.`);
    return { success: true, count: result.changes, message: `Cleared ${result.changes} finished items.` };
  } catch (error: any) {
    console.error('Failed to clear finished items:', error);
    return { success: false, count: 0, message: `Database error: ${error.message}` };
  }
}

// --- New Clear Cancelled Function ---

export function clearCancelled(): { success: boolean; count: number; message: string } {
  try {
    const result = stmtClearCancelled.run();
    console.log(`Cleared ${result.changes} cancelled items from DB.`);
    return { success: true, count: result.changes, message: `Cleared ${result.changes} cancelled items.` };
  } catch (error: any) {
    console.error('Failed to clear cancelled items:', error);
    return { success: false, count: 0, message: `Database error: ${error.message}` };
  }
}

// --- New Cancel Function ---

export function cancelItem(itemId: string): { success: boolean; message: string } {
  let item: QueueItem | undefined;
  try {
    item = stmtGetItemById.get(itemId) as QueueItem | undefined;
  } catch (dbError: any) {
    console.error(`Cancel Failed: Error retrieving item ${itemId} from DB:`, dbError);
    return { success: false, message: `Database error retrieving item: ${dbError.message}` };
  }

  if (!item) {
    return { success: false, message: `Cancel failed: Item with ID ${itemId} not found.` };
  }

  const currentStatus = item.status;

  if (currentStatus === 'queued') {
    try {
      const result = stmtDeleteItemById.run(itemId);
      if (result.changes > 0) {
        console.log(`Cancelled (deleted) queued item ${itemId}.`);
        return { success: true, message: 'Queued item cancelled.' };
      } else {
        console.warn(`Tried to cancel (delete) queued item ${itemId}, but it wasn't found or already deleted.`);
        return { success: false, message: 'Item not found or already removed.' };
      }
    } catch (deleteError: any) {
      console.error(`Cancel Failed: Error deleting queued item ${itemId}:`, deleteError);
      return { success: false, message: `Database error cancelling item: ${deleteError.message}` };
    }
  } else if (currentStatus === 'downloading') {
    // Try all available process termination methods
    
    // First, try to kill by specific process
    const process = activeDownloads.get(itemId);
    if (process) {
      try {
        process.kill('SIGKILL');
        console.log(`Sent SIGKILL to process for item ${itemId}`);
      } catch (error) {
        console.error(`Failed to kill process for ${itemId} with SIGKILL:`, error);
      }
      activeDownloads.delete(itemId);
    }
    
    // Second, attempt to forcefully kill all yt-dlp processes on Windows
    try {
      const { execSync } = require('child_process');
      
      // First find all yt-dlp processes
      console.log('Attempting to terminate all yt-dlp.exe processes...');
      
      // Kill all yt-dlp.exe processes forcefully
      execSync('taskkill /IM yt-dlp.exe /F /T', { encoding: 'utf8', stdio: 'pipe' });
      console.log('Successfully terminated all yt-dlp.exe processes');
      
      // Also kill any ffmpeg processes that might have been spawned
      try {
        execSync('taskkill /IM ffmpeg.exe /F /T', { encoding: 'utf8', stdio: 'pipe' });
        console.log('Successfully terminated all ffmpeg.exe processes');
      } catch (ffmpegError) {
        // It's okay if this fails - there might not be any ffmpeg processes
        console.log('No ffmpeg processes found to terminate');
      }
    } catch (taskkillError: any) {
      // If taskkill fails because no processes were found, that's okay
      console.log('Could not find yt-dlp processes to terminate:', taskkillError.message);
    }
    
    // Regardless of process termination success, update the database
    try {
      // Mark as CANCELLED
      const result = stmtUpdateStatus.run(
        'cancelled',
        'Cancelled by user during download.',
        item.title,
        item.local_path,
        item.info_json_path,
        Date.now(),
        itemId
      );
      
      if (result.changes > 0) {
        console.log(`Cancelled (marked as cancelled) downloading item ${itemId}.`);
        return { success: true, message: 'Downloading item cancelled.' };
      } else {
        console.warn(`Tried to cancel (mark cancelled) downloading item ${itemId}, but it wasn't found or status changed.`);
        return { success: false, message: 'Item not found or status changed.' };
      }
    } catch (updateError: any) {
      console.error(`Cancel Failed: Error marking downloading item ${itemId} as cancelled:`, updateError);
      return { success: false, message: `Database error cancelling item: ${updateError.message}` };
    }
  } else if (currentStatus === 'uploading') {
    // Handle cancellation of uploads - currently can just mark as cancelled in DB
    try {
      const result = stmtUpdateStatus.run(
        'cancelled',
        'Cancelled by user during upload.',
        item.title,
        item.local_path,
        item.info_json_path,
        Date.now(),
        itemId
      );
      
      if (result.changes > 0) {
        console.log(`Cancelled uploading item ${itemId}.`);
        return { success: true, message: 'Upload cancelled.' };
      } else {
        console.warn(`Tried to cancel uploading item ${itemId}, but it wasn't found or status changed.`);
        return { success: false, message: 'Item not found or status changed.' };
      }
    } catch (updateError: any) {
      console.error(`Cancel Failed: Error marking uploading item ${itemId} as cancelled:`, updateError);
      return { success: false, message: `Database error cancelling item: ${updateError.message}` };
    }
  } else {
    // Cannot cancel items in other states (completed, failed, uploading, uploaded)
    console.log(`Attempted to cancel item ${itemId} in non-cancellable state: ${currentStatus}`);
    return { success: false, message: `Cannot cancel item in '${currentStatus}' state.` };
  }
}

// --- Filemoon Encoding Status Polling (Use settings) ---

let isPollingEncoding = false;
const POLLING_INTERVAL = 30 * 1000; // Check every 30 seconds
// const UPLOADED_STATE_TIMEOUT = 10 * 60 * 1000; // Old 10 minutes 
const TRANSFERRING_STATE_TIMEOUT = 30 * 60 * 1000; // New: 30 minutes in milliseconds for transferring state
const ENCODING_STATE_TIMEOUT = 60 * 60 * 1000; // New: 60 minutes in milliseconds for encoding state

// --- Replace the transfer queue check function with a more comprehensive status check ---
async function checkFilemoonTransferQueueStatus(filecode: string): Promise<{ 
  inTransferQueue: boolean;
  queueNumber?: string;
  errorMessage?: string;
  isEncoding?: boolean;
  encodingProgress?: number;
  isEncoded?: boolean;
  statusMessage: string;
}> {
  try {
    const filemoonUrl = `https://filemoon.to/d/${filecode}`;
    console.log(`Checking webpage status for ${filecode} at ${filemoonUrl}`);
    
    // Fetch the webpage content
    const response = await axios.get(filemoonUrl, {
      timeout: 15000, // 15s timeout
      headers: {
        // Set user agent to mimic a browser request
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
      }
    });
    
    const html = response.data;
    
    // Check if the page contains the transfer queue message
    if (html.includes('Pending in Transfer Queue')) {
      // Try to extract the queue number if present (e.g., "Pending in Transfer Queue #47787")
      const queueMatch = html.match(/Pending in Transfer Queue #(\d+)/i);
      const queueNumber = queueMatch ? queueMatch[1] : undefined;
      const statusMessage = queueNumber ? `Pending in transfer queue #${queueNumber}` : 'Pending in transfer queue';
      
      console.log(`File ${filecode} is pending in transfer queue${queueNumber ? ` #${queueNumber}` : ''}`);
      return { 
        inTransferQueue: true, 
        queueNumber,
        statusMessage,
        isEncoding: false,
        isEncoded: false
      };
    }
    
    // Check if the file is being encoded (look for encoding progress indicators)
    if (html.includes('Processing') || html.includes('Converting') || html.includes('Encoding')) {
      // Try to extract encoding progress if available
      // This regex looks for patterns like "Encoding: 45%" or "Converting... 45%"
      const progressMatch = html.match(/(?:Encoding|Processing|Converting)(?:\s*[:.]\s*|\.\.\.\s*)(\d+)%/i);
      const encodingProgress = progressMatch ? parseInt(progressMatch[1], 10) : undefined;
      const statusMessage = encodingProgress ? `Encoding: ${encodingProgress}%` : 'Currently encoding...';
      
      console.log(`File ${filecode} is being encoded${encodingProgress ? ` at ${encodingProgress}%` : ''}`);
      return {
        inTransferQueue: false,
        isEncoding: true,
        encodingProgress,
        statusMessage,
        isEncoded: false
      };
    }
    
    // Check if player is available, indicating encoding is complete
    if (html.includes('player') || html.includes('video-js') || html.includes('play-btn') || 
        (!html.includes('file-unavailable') && !html.includes('file not found'))) {
      console.log(`File ${filecode} appears to be fully encoded (player elements found)`);
      return {
        inTransferQueue: false,
        isEncoding: false,
        isEncoded: true,
        statusMessage: 'File encoding complete'
      };
    }
    
    // Check for error messages
    if (html.includes('Error') || html.includes('Failed') || html.includes('file not found') || html.includes('does not exist')) {
      console.log(`File ${filecode} has an error message on the page`);
      return {
        inTransferQueue: false,
        isEncoding: false,
        isEncoded: false,
        statusMessage: 'Encoding failed or file unavailable',
        errorMessage: 'File error detected on page'
      };
    }
    
    // Status could not be determined clearly
    console.log(`File ${filecode} status could not be determined from webpage content`);
    return {
      inTransferQueue: false,
      isEncoding: false,
      isEncoded: false,
      statusMessage: 'Status could not be determined from webpage'
    };
  } catch (error: any) {
    console.error(`Error checking webpage status for ${filecode}:`, error.message);
    return { 
      inTransferQueue: false,
      isEncoding: false,
      isEncoded: false,
      statusMessage: 'Error checking file status',
      errorMessage: `Failed to check file status: ${error.message}`
    };
  }
}

// --- Update the pollEncodingStatus function to use the new comprehensive webpage status check ---
async function pollEncodingStatus() {
    if (isPollingEncoding) return;
    isPollingEncoding = true;

    const apiKey = getSetting('filemoon_api_key'); 
    if (!apiKey) {
        console.error('Encoding Poll: Filemoon API key not found in settings, skipping poll.');
        isPollingEncoding = false;
        return;
    }

    const filecodesFromApi = new Set<string>();
    let localItemsToPoll: QueueItem[] = [];

    try {
        // 1. Get local items that need status check
        try {
            localItemsToPoll = stmtGetItemsToCheck.all() as QueueItem[];
        } catch (dbError: any) {
            console.error('Encoding Poll: DB error fetching local items to check:', dbError);
            isPollingEncoding = false;
            return; 
        }

        if (localItemsToPoll.length === 0) {
            // Nothing to check
            isPollingEncoding = false;
            return;
        }

        // Process items with Filemoon URLs using webpage status check
        const itemsToCheck = localItemsToPoll.filter(item => 
            (item.status === 'transferring' || item.status === 'encoding') && item.filemoon_url);
        
        for (const item of itemsToCheck) {
            if (!item.filemoon_url) continue;
            
            // Check status directly from the webpage
            const webStatus = await checkFilemoonTransferQueueStatus(item.filemoon_url);
            
            if (webStatus.inTransferQueue) {
                // Update message with queue position
                stmtUpdateEncodingStatus.run(
                    'transferring',  // Keep status as transferring
                    null,            // No progress percentage for transfer queue
                    webStatus.statusMessage,    // Update the message with queue information
                    Date.now(),
                    item.id
                );
                
                console.log(`Updated item ${item.id} with transfer queue status: ${webStatus.statusMessage}`);
            } else if (webStatus.isEncoding) {
                // File is being encoded
                stmtUpdateEncodingStatus.run(
                    'encoding',  // Set status to encoding
                    webStatus.encodingProgress || item.encoding_progress || 0,
                    webStatus.statusMessage,
                    Date.now(),
                    item.id
                );
                
                console.log(`Updated item ${item.id} with encoding status: ${webStatus.statusMessage}`);
            } else if (webStatus.isEncoded) {
                // File is encoded and ready
                     stmtUpdateEncodingStatus.run(
                    'encoded',  // Set status to encoded
                    100,        // Set progress to 100%
                    webStatus.statusMessage,
                         Date.now(),
                    item.id
                );
                
                console.log(`Updated item ${item.id} to encoded status: ${webStatus.statusMessage}`);
            } else if (webStatus.errorMessage && item.status !== 'transferring') {
                // Only update to error if the item was not in transferring state
                        stmtUpdateEncodingStatus.run(
                    'failed',  // Set status to failed
                    null,      // Clear progress
                    webStatus.statusMessage,
                            Date.now(),
                    item.id
                        );
                
                console.log(`Updated item ${item.id} to failed status: ${webStatus.statusMessage}`);
                    } else {
                // Log that we couldn't determine status, but don't change the item status
                console.log(`Could not determine status for item ${item.id} (${item.filemoon_url}): ${webStatus.statusMessage}`);
            }
        }
        
        // Continue with API polling logic for encoding status
        // Refresh the items list to include updated statuses
        localItemsToPoll = db.prepare(
            "SELECT id, filemoon_url, status, encoding_progress, updated_at FROM queue WHERE status = 'uploaded' OR status = 'transferring' OR status = 'encoding'"
        ).all() as QueueItem[];
        
        // Exit if no items to check after filtering
        if (localItemsToPoll.length === 0) {
            isPollingEncoding = false;
            return;
        }

        // Apply timeouts for items that have been in the same state for too long
        const now = Date.now();
        for (const item of localItemsToPoll) {
            if (item.status === 'transferring' && (now - item.updated_at > TRANSFERRING_STATE_TIMEOUT)) {
                console.warn(`Encoding Poll: Item ${item.id} stuck in 'transferring' for >${TRANSFERRING_STATE_TIMEOUT / 60000}min. Marking as failed.`);
                stmtUpdateEncodingStatus.run(
                    'failed',
                    null,
                    `Processing timed out (>${TRANSFERRING_STATE_TIMEOUT / 60000}min in transferring state).`,
                    now,
                    item.id
                );
            } else if (item.status === 'encoding' && (now - item.updated_at > ENCODING_STATE_TIMEOUT)) {
                console.warn(`Encoding Poll: Item ${item.id} stuck in 'encoding' for >${ENCODING_STATE_TIMEOUT / 60000}min. Marking as failed.`);
                stmtUpdateEncodingStatus.run(
                    'failed',
                    item.encoding_progress,
                    `Processing timed out (>${ENCODING_STATE_TIMEOUT / 60000}min in encoding state).`,
                    now,
                    item.id
                );
            }
        }

    } catch (error: any) {
        console.error(`Encoding Poll: Error during status check:`, error.response?.data || error.message || error);
    } finally {
        isPollingEncoding = false;
    }
}

// --- Updated Get Queue Functions ---

/**
 * Gets items that are currently active (not completed/encoded or failed/cancelled).
 */
export function getActiveQueue(): QueueItem[] {
  try {
    // Exclude final states - now also excludes 'encoded' status so encoded items are only in gallery
    return db.prepare(
        "SELECT * FROM queue WHERE status NOT IN ('encoded', 'failed', 'cancelled') ORDER BY added_at DESC"
    ).all() as QueueItem[];
  } catch (error: any) {
    console.error('Failed to fetch active queue from DB:', error);
    return []; 
  }
}

/**
 * Gets only the successfully encoded items.
 */
export function getEncodedItems(): QueueItem[] {
  try {
    return db.prepare(
        "SELECT * FROM queue WHERE status = 'encoded' ORDER BY updated_at DESC" // Order by completion time
    ).all() as QueueItem[];
  } catch (error: any) {
    console.error('Failed to fetch encoded items from DB:', error);
    return [];
  }
}

// Start the polling loop
setInterval(pollEncodingStatus, POLLING_INTERVAL);
// Run once on startup after a short delay
setTimeout(pollEncodingStatus, 5000);

// --- New Retry Function --- 

export function retryFailedDownloadOrUpload(itemId: string): { success: boolean; message: string } {
    let item: QueueItem | undefined;
    try {
        item = stmtGetItemById.get(itemId) as QueueItem | undefined;
    } catch (dbError: any) {
        console.error(`Retry Failed: DB error retrieving item ${itemId}:`, dbError);
        return { success: false, message: `Database error retrieving item: ${dbError.message}` };
    }

    if (!item) {
        return { success: false, message: `Retry failed: Item ${itemId} not found.` };
    }

    // Only allow retry if failed before/during upload (no filemoon_url)
    if (item.status !== 'failed' || item.filemoon_url) {
        return { success: false, message: `Retry failed: Item ${itemId} is not in a retryable failed state (status: ${item.status}, has filemoon_url: ${!!item.filemoon_url}).` };
    }

    try {
        // Reset status to queued, clear message, update timestamp
        const stmtRetry = db.prepare('UPDATE queue SET status = ?, message = ?, updated_at = ? WHERE id = ?');
        const result = stmtRetry.run('queued', 'Retrying...', Date.now(), itemId);

        if (result.changes > 0) {
            console.log(`Retry Queued: Item ${itemId} status reset to 'queued'.`);
            triggerProcessing(); // Signal the queue processor to check for work
            return { success: true, message: 'Item re-queued for processing.' };
        } else {
            // Should not happen if item was found, but handle defensively
            console.warn(`Retry Failed: No changes made to DB for item ${itemId}.`);
            return { success: false, message: 'Retry failed: Could not update item status.' };
        }
    } catch (updateError: any) {
        console.error(`Retry Failed: DB error updating item ${itemId} to queued:`, updateError);
        return { success: false, message: `Database error during retry: ${updateError.message}` };
    }
}

// --- New Restart Encoding Function (Use settings) ---

export async function restartFilemoonEncoding(itemId: string): Promise<{ success: boolean; message: string }> {
  const apiKey = getSetting('filemoon_api_key'); // <-- Read API key from settings
  if (!apiKey) {
    console.error('Restart: Filemoon API key not found in settings.');
    return { success: false, message: 'Restart failed: Filemoon API key is missing in settings.' };
  }

  let item: QueueItem | undefined;
  try {
    item = stmtGetItemById.get(itemId) as QueueItem | undefined;
  } catch (dbError: any) {
    console.error(`Failed to retrieve item ${itemId} from DB:`, dbError);
    return { success: false, message: `Database error retrieving item: ${dbError.message}` };
  }

  if (!item) {
    return { success: false, message: `Restart failed: Item with ID ${itemId} not found.` };
  }

  if (!item.filemoon_url) {
    return { success: false, message: `Restart failed: Item has no Filemoon URL to restart.` };
  }

  const filecode = item.filemoon_url;

  try {
    // --- First check file status by parsing the webpage ---
    const webStatus = await checkFilemoonTransferQueueStatus(filecode);
    
    if (webStatus.inTransferQueue) {
      // File is still in transfer queue, cannot restart encoding
      const queueMessage = webStatus.statusMessage;
        
      // Update status message but don't change status
      stmtUpdateEncodingStatus.run(
        'transferring',
        null,
        queueMessage,
        Date.now(),
        item.id
      );
      
      return { 
        success: false, 
        message: `Cannot restart encoding: File is still ${queueMessage.toLowerCase()}. Please wait until transfer is complete.` 
      };
    }
    
    if (webStatus.isEncoding) {
      // File is already in encoding process
      stmtUpdateEncodingStatus.run(
        'encoding',
        webStatus.encodingProgress || 0,
        webStatus.statusMessage,
        Date.now(),
        item.id
      );
      
      return { 
        success: true, 
        message: `File is already being encoded (${webStatus.statusMessage}). Status updated.` 
      };
    }
    
    if (webStatus.isEncoded) {
      // File is already encoded
        stmtUpdateEncodingStatus.run(
        'encoded',
        100,
        webStatus.statusMessage,
            Date.now(),
            item.id
        );
      
      return { 
        success: true, 
        message: 'File is already successfully encoded. Status updated.' 
      };
    }
    
    // If we get here, the file exists but status is inconclusive - just inform the user
    return {
      success: false,
      message: `Could not determine file status from web page. Status: ${webStatus.statusMessage}`
    };
  } catch (error: any) {
    console.error(`Restart Failed: Error checking status for item ${itemId} (Filecode: ${filecode}):`, error.message);
    return { success: false, message: `Error checking file status: ${error.message}` };
  }
}

// Start the polling loop
setInterval(pollEncodingStatus, POLLING_INTERVAL);
// Run once on startup after a short delay 