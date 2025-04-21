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
      encoding_progress INTEGER, 
      thumbnail_url TEXT, -- Add thumbnail URL column
      added_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

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
const stmtGetQueue = db.prepare('SELECT * FROM queue ORDER BY added_at DESC');
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
    encoding_progress?: number | null;
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
       console.log(`URL already exists in queue: ${url}`);
       return { success: false, message: 'URL already exists in the queue.' };
    }
  } catch (error: any) {
    console.error(`Failed to add URL to queue DB: ${url}`, error);
    return { success: false, message: `Database error: ${error.message}` };
  }
}

export function getQueue(): QueueItem[] {
  try {
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
  try {
    // Mark as downloading
    stmtMarkDownloading.run('downloading', 'Download starting...', startTime, itemToProcess.id);
    console.log(`Processing item from DB: ${itemToProcess.id} - ${itemToProcess.url} into ${downloadDir}`);

    // Start the download (pass the specific downloadDir)
    const downloadPromise = downloadVideo(itemToProcess, downloadDir);

    // Set up a cancellation check interval that runs every 2 seconds during download
    const cancellationCheckIntervalId = setInterval(() => {
      try {
        // Check if the item's status has changed to 'cancelled' during download
        const currentItem = stmtGetItemById.get(itemToProcess!.id) as QueueItem | undefined;
        
        if (currentItem && currentItem.status === 'cancelled') {
          console.log(`Item ${itemToProcess!.id} was cancelled during download. Terminating processes.`);
          
          // Kill all yt-dlp processes to be safe
          try {
            const { execSync } = require('child_process');
            execSync('taskkill /IM yt-dlp.exe /F /T', { encoding: 'utf8', stdio: 'pipe' });
            console.log('Terminated yt-dlp processes during cancellation check');
          } catch (killError) {
            // It's okay if this fails
          }
          
          // Clear the interval since we've detected cancellation
          clearInterval(cancellationCheckIntervalId);
        }
      } catch (checkError) {
        console.error(`Error checking cancellation status for ${itemToProcess!.id}:`, checkError);
      }
    }, 2000); // Check every 2 seconds

    // Wait for download to complete
    const result = await downloadPromise;
    
    // Clear the cancellation check interval
    clearInterval(cancellationCheckIntervalId);
    
    // Check the item's current status to make sure it hasn't been cancelled during download
    const currentStatus = (stmtGetItemById.get(itemToProcess.id) as QueueItem | undefined)?.status;
    
    // Only update if the item isn't cancelled
    if (currentStatus !== 'cancelled') {
      // Update based on result
      stmtUpdateStatus.run(
          result.success ? 'completed' : 'failed',
          result.message ?? null,
          result.title ?? itemToProcess.title ?? null, // Keep old title if new one is null
          result.local_path ?? null,
          result.info_json_path ?? null,
          Date.now(), // updated_at
          itemToProcess.id
      );
      console.log(`Queue item ${itemToProcess.id} update COMPLETE: Status=${result.success ? 'completed' : 'failed'}`);
    } else {
      console.log(`Queue item ${itemToProcess.id} was cancelled, not updating to completed status`);
    }

  } catch (processingError: any) {
     // Catch errors during the update/processing itself
     console.error(`CRITICAL: Error processing queue item ${itemToProcess.id}:`, processingError);

     // Check if the item has been cancelled before marking as failed
     const currentStatus = (stmtGetItemById.get(itemToProcess.id) as QueueItem | undefined)?.status;
     if (currentStatus !== 'cancelled') {
       // Mark as failed in DB only if it wasn't cancelled
       try {
           stmtUpdateStatus.run('failed', `Processing error: ${processingError.message}`, itemToProcess.title, null, null, Date.now(), itemToProcess.id);
       } catch (dbUpdateError) {
           console.error(`Failed to mark item ${itemToProcess.id} as failed after processing error:`, dbUpdateError);
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

async function downloadVideo(item: QueueItem, downloadDir: string): Promise<DownloadResult> {
    let videoTitle = item.title || 'unknown_title';
    let infoJsonPath = '';
    let localVideoPath = '';
    let finalOutputTemplate = ''; // Define it here
    let childProcess: ChildProcess | null = null;

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
        // IMPORTANT: Predict info.json path based on the sanitized title *before* download
        infoJsonPath = path.join(downloadDir, `${safeTitle}.info.json`);
        // Set the output template for yt-dlp
        finalOutputTemplate = path.join(downloadDir, `${safeTitle}.%(ext)s`);

        // --- Execute Download ---
        const args = [
            item.url,
            '--write-info-json', // Keep metadata
            '--output', finalOutputTemplate,
            // Add other args back if needed:
            // '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            // '--ffmpeg-location', process.env.FFMPEG_PATH || 'ffmpeg',
            // '--no-warnings',
            // '--progress',
            // '--newline'
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

        // --- Listen to stdout for progress --- 
        childProcess.stdout?.on('data', (data) => {
            const output = data.toString();
            // console.log('yt-dlp stdout chunk:', output); // Debug: Log raw output

            // Regex to find download percentage (handles variations)
            const progressMatch = output.match(/\[download\]\s+([0-9.]+)\%/);
            if (progressMatch && progressMatch[1]) {
                const currentPercent = parseFloat(progressMatch[1]);
                latestPercent = Math.max(latestPercent, currentPercent); // Keep track of highest percentage seen

                // Throttle DB updates
                const now = Date.now();
                if (now - lastProgressUpdate > progressUpdateInterval) {
                    const progressMessage = `Downloading: ${Math.floor(latestPercent)}%`;
                    try {
                        stmtUpdateDownloadProgress.run(progressMessage, now, item.id);
                        // console.log(`Item ${item.id}: Updated download progress to ${latestPercent}%`); // Debug log
                        lastProgressUpdate = now;
                    } catch (dbError) {
                        console.error(`Item ${item.id}: Failed to update download progress in DB:`, dbError);
                    }
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

                            // Check if the predicted info.json exists
                            try {
                                await fsPromises.access(infoJsonPath);
                                console.log(`Found info.json: ${infoJsonPath}`);
                            } catch (e) {
                                console.warn(`Could not find expected info.json file: ${infoJsonPath}`);
                                infoJsonPath = ''; // Reset path if not found
                            }

                            // Find the actual video file matching the pattern
                            const files = await fsPromises.readdir(downloadDir);
                            const videoFile = files.find(f => f.startsWith(safeTitle) && f !== `${safeTitle}.info.json`);

                            if (!videoFile && !infoJsonPath) {
                                return reject(new Error('Download finished successfully (code 0), but no video or info.json file found.'));
                            } else if (!videoFile && infoJsonPath) {
                                console.warn(`Video file starting with '${safeTitle}' not found, but info.json exists.`);
                                return resolve({ success: true, message: 'Metadata downloaded, video file missing/failed.', title: videoTitle, local_path: undefined, info_json_path: infoJsonPath });
                            } else if (videoFile) {
                                localVideoPath = path.join(downloadDir, videoFile);
                                console.log(`Found video file: ${localVideoPath}`);
                                return resolve({ success: true, message: `Download complete: ${videoFile ?? 'Metadata only'}`, title: videoTitle, local_path: localVideoPath || undefined, info_json_path: infoJsonPath || undefined });
                            }
                        } catch (verifyError) {
                            reject(verifyError);
                        }
                    })();
                } else {
                    // Process exited with an error code
                    console.error(`yt-dlp process for ${item.id} exited with code ${code}.`);
                    // Check if it was killed due to cancellation flag (this check might be less reliable now)
                    // const currentDbStatus = (stmtGetItemById.get(item.id) as QueueItem | undefined)?.status;
                    // if (currentDbStatus === 'cancelled') { ... }
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
    const apiKey = getSetting('filemoon_api_key'); // <-- Read API key from settings
    if (!apiKey) {
        console.error('Filemoon API key not found in settings.');
        return { success: false, message: 'Upload failed: Filemoon API key is missing in settings.' };
    }

    let item: QueueItem | undefined;
    try {
        item = stmtGetItemById.get(itemId) as QueueItem | undefined;
    } catch (dbError: any) {
        console.error(`Failed to retrieve item ${itemId} from DB:`, dbError);
        return { success: false, message: `Database error retrieving item: ${dbError.message}` };
    }

    if (!item) {
        return { success: false, message: `Upload failed: Item with ID ${itemId} not found.` };
    }
    if (!item.local_path || item.status !== 'completed') {
        return { success: false, message: `Upload failed: Item ${itemId} is not in 'completed' state or missing local file path.` };
    }

    const filePath = item.local_path;

    // 1. Check if file exists
    try {
        await fsPromises.access(filePath);
    } catch (fileError) {
        console.error(`File not found for upload: ${filePath}`);
        // Update DB to reflect the error
        try {
           stmtUpdateStatus.run('failed', `Upload error: Local file not found at ${filePath}`, item.title, item.local_path, item.info_json_path, Date.now(), item.id);
        } catch (dbUpdateError) { console.error(`Failed to mark item ${item.id} as failed after file not found error:`, dbUpdateError); }
        return { success: false, message: 'Upload failed: Local file not found.' };
    }

    try {
        // 2. Mark as 'uploading' in DB
        const now = Date.now();
        stmtMarkUploading.run('uploading', 'Starting Filemoon upload...', now, item.id);
        console.log(`Item ${itemId}: Marked as uploading.`);

        // 3. Get Upload Server URL
        console.log(`Item ${itemId}: Requesting Filemoon upload server...`);
        const serverResponse = await axios.get(`https://filemoonapi.com/api/upload/server?key=${apiKey}`);
        if (serverResponse.data?.status !== 200 || !serverResponse.data?.result) {
            throw new Error(`Failed to get Filemoon upload server. Status: ${serverResponse.data?.status}, Msg: ${serverResponse.data?.msg}`);
        }
        const uploadUrl = serverResponse.data.result;
        console.log(`Item ${itemId}: Received upload server URL: ${uploadUrl}`);

        // 4. Prepare Form Data
        const formData = new FormData();
        formData.append('key', apiKey);
        // IMPORTANT: Use fs.createReadStream for large files
        formData.append('file', fs.createReadStream(filePath), path.basename(filePath)); // Send filename

        // --- Get file size for accurate progress --- 
        const stats = await fsPromises.stat(filePath);
        const fileSize = stats.size;
        // The form-data library can calculate the total length synchronously -- REMOVE THIS
        // const contentLength = formData.getLengthSync(); 

        // 5. Upload File
        console.log(`Item ${itemId}: Uploading file ${filePath} (${fileSize} bytes) to ${uploadUrl}...`);
        const uploadResponse = await axios.post(uploadUrl, formData, {
            // Remove explicit Content-Length, let axios handle streaming
            headers: formData.getHeaders(), // Just use headers from form-data
            maxContentLength: Infinity, // Allow large file uploads
            maxBodyLength: Infinity,
            // Add progress handler - REMOVE THIS
            // onUploadProgress: (progressEvent) => {
            //     // Use fileSize obtained via fs.stat for more reliable percentage
            //     if (fileSize > 0) {
            //         const percentCompleted = Math.round((progressEvent.loaded * 100) / fileSize);
            //         const now = Date.now();
            //         // Throttle DB updates and ensure we report 100% if loaded equals/exceeds fileSize
            //         if (now - lastProgressUpdate > updateInterval || progressEvent.loaded >= fileSize) {
            //             // Clamp percentage between 0 and 100
            //             const displayPercent = Math.min(100, Math.max(0, percentCompleted)); 
            //             const progressMessage = `Uploading: ${displayPercent}%`;
            //             try {
            //                 // Use stmtMarkUploading to set status and initial message if needed,
            //                 // but use stmtUpdateUploadProgress for subsequent updates.
            //                 // Ensure status is 'uploading' here.
            //                 stmtUpdateUploadProgress.run(progressMessage, now, item.id);
            //                 lastProgressUpdate = now;
            //                 // Optional: Log progress update to console
            //                 // console.log(`Item ${itemId}: ${progressMessage}`);
            //             } catch (dbError) {
            //                 console.error(`Item ${itemId}: Failed to update upload progress in DB:`, dbError);
            //             }
            //         }
            //     } else {
            //         // Handle case where file size is 0 or unknown (though fs.stat should prevent this)
            //         if (Date.now() - lastProgressUpdate > updateInterval) { // Still throttle
            //              stmtUpdateUploadProgress.run('Uploading: (calculating...)', Date.now(), item.id);
            //              lastProgressUpdate = Date.now();
            //         }
            //     }
            // }
        });

        console.log(`Item ${itemId}: Upload response status: ${uploadResponse.status}`);
        console.log(`Item ${itemId}: Upload response data:`, JSON.stringify(uploadResponse.data, null, 2)); // Log the full response data clearly

        if (uploadResponse.data?.status !== 200 || !uploadResponse.data?.files || uploadResponse.data.files.length === 0) {
            console.error(`Item ${itemId}: Throwing error due to invalid Filemoon response structure or status.`);
            throw new Error(`Filemoon upload failed after request. Status: ${uploadResponse.data?.status}, Msg: ${uploadResponse.data?.msg}`);
        }

        const uploadedFile = uploadResponse.data.files[0];
        console.log(`Item ${itemId}: Processing uploaded file details:`, uploadedFile);
        if (uploadedFile?.status !== 'OK' || !uploadedFile?.filecode) {
             console.error(`Item ${itemId}: Throwing error due to file status not OK or missing filecode.`);
             throw new Error(`Filemoon upload result indicates failure. File status: ${uploadedFile?.status}, Filecode: ${uploadedFile?.filecode}`);
        }

        const filecode = uploadedFile.filecode;
        const filemoonUrl = `https://filemoon.to/d/${filecode}`; 
        console.log(`Item ${itemId}: Upload successful! Filecode: ${filecode}, URL: ${filemoonUrl}`);
        
        // 6. Update DB to 'transferring' 
        console.log(`Item ${itemId}: Attempting to update database status to 'transferring'...`);
        stmtUpdateAfterUpload.run('transferring', filecode, `Upload successful. Waiting for transfer/encoding...`, Date.now(), item.id); // <-- Change status to transferring
        console.log(`Item ${itemId}: Database status updated to 'transferring'.`);

        // 7. Optional: Delete local file if configured in settings
        if (shouldDeleteAfterUpload()) { // <-- Use setting function
            console.log(`Item ${itemId}: Deleting local files after successful upload (setting is enabled)...`);
            try {
                await fsPromises.unlink(filePath);
                console.log(`  - Deleted video: ${filePath}`);
                if (item.info_json_path) {
                    // Check if info.json still exists before trying to delete
                    try {
                       await fsPromises.access(item.info_json_path);
                       await fsPromises.unlink(item.info_json_path);
                       console.log(`  - Deleted metadata: ${item.info_json_path}`);
                    } catch (infoAccessError: any) {
                        if (infoAccessError.code !== 'ENOENT') {
                           console.warn(`  - Could not delete metadata file ${item.info_json_path} (may already be gone or permissions issue):`, infoAccessError.message);
                        } else {
                           console.log(`  - Metadata file ${item.info_json_path} already gone.`);
                        }
                    }
                }
            } catch (deleteError: any) {
                console.error(`  - Failed to delete local file(s) for item ${itemId} after upload:`, deleteError.message);
                // Don't fail the overall upload function, just log the error
            }
        } else {
             console.log(`Item ${itemId}: Keeping local files after successful upload (setting is disabled).`);
        }

        return { success: true, message: `Upload successful! Filecode: ${filecode}`, filecode: filecode };

    } catch (uploadError: any) {
        console.error(`Failed to upload item ${itemId} (${filePath}) to Filemoon:`, uploadError.response?.data || uploadError.message || uploadError);
        let errorMessage = 'Filemoon upload failed.';
        if (axios.isAxiosError(uploadError)) {
            errorMessage = `Filemoon API error: ${uploadError.response?.status} - ${uploadError.response?.data?.msg || uploadError.message}`;
        } else if (uploadError instanceof Error) {
            errorMessage = `Upload error: ${uploadError.message}`;
        }

        // Update DB to 'failed'
        try {
             stmtUpdateStatus.run('failed', errorMessage, item.title, item.local_path, item.info_json_path, Date.now(), item.id);
        } catch (dbUpdateError) { console.error(`Failed to mark item ${item.id} as failed after upload error:`, dbUpdateError); }

        return { success: false, message: errorMessage };
    }
}

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
        try {
            // Fetch items in 'transferring' or 'encoding' state
            localItemsToPoll = db.prepare(
                "SELECT id, filemoon_url, status, encoding_progress, updated_at FROM queue WHERE status = 'transferring' OR status = 'encoding'" // <-- Updated query
            ).all() as QueueItem[];
        } catch (dbError: any) {
            console.error('Encoding Poll: DB error fetching local items to check:', dbError);
            isPollingEncoding = false;
            return; 
        }

        if (localItemsToPoll.length === 0) {
            isPollingEncoding = false;
            return;
        }

        const apiUrl = `https://filemoonapi.com/api/encoding/list?key=${apiKey}`;
        console.log(`Encoding Poll: Fetching encoding list from ${apiUrl} for ${localItemsToPoll.length} items...`);
        const response = await axios.get(apiUrl, { timeout: 15000 }); 

        if (response.data?.status !== 200 || !Array.isArray(response.data?.result)) {
            console.warn(`Encoding Poll: Received non-200 or invalid response structure from /encoding/list. Status: ${response.data?.status}, Msg: ${response.data?.msg}`);
        } 
        
        const encodingResults = Array.isArray(response.data?.result) ? response.data.result : [];
        console.log(`Encoding Poll: Received status for ${encodingResults.length} actual item(s) from Filemoon API.`);

        // Process results from the API
        for (const result of encodingResults) {
            const filecode = result.file_code;
            if (!filecode) continue;
            filecodesFromApi.add(filecode);

            const localItem = localItemsToPoll.find(item => item.filemoon_url === filecode);
            if (!localItem) continue; 

            // Process status for item found in API list
            const encodingStatus = result.status?.toUpperCase();
            const progress = result.progress ? parseInt(result.progress, 10) : null;
            const errorMsg = result.error ?? null;

            let message = '';
            let newDbStatus: QueueItem['status'] = localItem.status; 
            let encodingProgressValue = localItem.encoding_progress;
            let justFinishedEncoding = false; // Flag to trigger thumbnail fetch

            // Determine new status based on API response
            if (encodingStatus === 'PENDING') { 
                newDbStatus = 'encoding'; 
                encodingProgressValue = progress ?? 0; 
                message = 'Pending in encoding queue...';
            } else if (encodingStatus === 'ENCODING' || encodingStatus === 'PROCESSING') {
                newDbStatus = 'encoding';
                encodingProgressValue = progress;
                message = `Encoding: ${progress ?? 0}%`;
            } else if (encodingStatus === 'COMPLETED' || encodingStatus === 'READY') {
                 newDbStatus = 'encoded';
                 encodingProgressValue = 100;
                 message = 'Encoding complete.';
                 justFinishedEncoding = true; // Set flag
                 console.log(`Encoding Poll: Item ${localItem.id} (Filecode: ${filecode}) finished encoding according to API.`);
            } else if (encodingStatus === 'ERROR') {
                newDbStatus = 'failed';
                encodingProgressValue = null; 
                message = `Encoding failed: ${errorMsg ?? 'Unknown error'}`;
                 console.error(`Encoding Poll: Item ${localItem.id} (Filecode: ${filecode}) failed encoding: ${message}`);
            } else {
                 console.warn(`Encoding Poll: Item ${localItem.id} (Filecode: ${filecode}) has unknown API status '${result.status}'. Keeping local status '${localItem.status}'.`);
                 message = result.status ? `Unknown API status: ${result.status}` : 'Waiting for encoding status...'; 
                 encodingProgressValue = progress; 
            }

            // Update DB only if status or progress changed
            if (newDbStatus !== localItem.status || encodingProgressValue !== localItem.encoding_progress) {
                console.log(`Encoding Poll: Updating ${localItem.id}. From: ${localItem.status} (${localItem.encoding_progress}%) -> To: ${newDbStatus} (${encodingProgressValue}%) (API: ${encodingStatus})`);
                stmtUpdateEncodingStatus.run(newDbStatus, encodingProgressValue, message, Date.now(), localItem.id);
            } else if (localItem.status === 'encoding') {
                 // --- Add check for encoding timeout --- 
                 const timeSinceLastUpdate = Date.now() - localItem.updated_at;
                 if (timeSinceLastUpdate > ENCODING_STATE_TIMEOUT) {
                     console.warn(`Encoding Poll: Item ${localItem.id} stuck in 'encoding' state for >${ENCODING_STATE_TIMEOUT / 60000}min. Marking as failed.`);
                     stmtUpdateEncodingStatus.run(
                         'failed', // New status
                         localItem.encoding_progress, // Keep last known progress
                         `Processing timed out (>${ENCODING_STATE_TIMEOUT / 60000}min in encoding state).`, // Message
                         Date.now(),
                         localItem.id
                     );
                     console.log(`Encoding Poll: Updated timed-out encoding item ${localItem.id} to status failed`);
                 }
                 // --- End encoding timeout check ---
            }
        } 

        // Check for local items NOT reported by the API 
        console.log('Encoding Poll: Checking for local items not present in API list...');
        for (const localItem of localItemsToPoll) {
            if (localItem.filemoon_url && !filecodesFromApi.has(localItem.filemoon_url)) {
                
                if (localItem.status === 'encoding') {
                    // WAS encoding, now gone -> presume complete
                    console.log(`Encoding Poll: Item ${localItem.id} was 'encoding' and not in API list. Assuming complete.`);
                    stmtUpdateEncodingStatus.run('encoded', 100, 'Encoding presumed complete (not in API list).', Date.now(), localItem.id);
                } else if (localItem.status === 'transferring') {
                    // Was transferring, still not in API list -> apply timeout
                    const timeSinceLastUpdate = Date.now() - localItem.updated_at;
                    if (timeSinceLastUpdate > TRANSFERRING_STATE_TIMEOUT) { // <-- Use new timeout value
                        // Stuck in transferring for too long -> mark as failed (timeout)
                        console.warn(`Encoding Poll: Item ${localItem.id} stuck in 'transferring' for >${TRANSFERRING_STATE_TIMEOUT / 60000}min. Marking as failed.`); // <-- Use new timeout value in log
                        stmtUpdateEncodingStatus.run(
                            'failed', // New status
                            null,     // Progress
                            `Processing timed out (>${TRANSFERRING_STATE_TIMEOUT / 60000}min in transferring state).`, // Message <-- Use new timeout value in message
                            Date.now(),
                            localItem.id
                        );
                        console.log(`Encoding Poll: Updated timed-out transferring item ${localItem.id} to status failed`);
                    } else {
                         // Not timed out yet, keep waiting.
                         console.log(`Encoding Poll: Item ${localItem.id} is 'transferring' but not yet in encoding API list. Waiting (age: ${Math.round(timeSinceLastUpdate / 1000)}s)...`);
                    }
                }
            }
        }

    } catch (error: any) {
        console.error(`Encoding Poll: Error during API call or processing:`, error.response?.data || error.message || error);
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
    // Exclude final states
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

// --- New Restart Encoding Function (Use settings) ---

export async function restartFilemoonEncoding(itemId: string): Promise<{ success: boolean; message: string }> {
  const apiKey = getSetting('filemoon_api_key'); // <-- Read API key from settings
  if (!apiKey) {
    console.error('Restart Encoding Failed: Filemoon API key not found in settings.');
    return { success: false, message: 'Restart failed: Filemoon API key is missing in settings.' };
  }

  let item: QueueItem | undefined;
  try {
    item = stmtGetItemById.get(itemId) as QueueItem | undefined;
  } catch (dbError: any) {
    console.error(`Restart Encoding Failed: DB error retrieving item ${itemId}:`, dbError);
    return { success: false, message: `Database error retrieving item: ${dbError.message}` };
  }

  if (!item) {
    return { success: false, message: `Restart failed: Item ${itemId} not found.` };
  }
  if (!item.filemoon_url) {
    return { success: false, message: `Restart failed: Item ${itemId} does not have a Filemoon filecode (was it uploaded?).` };
  }
  // Optional: Check if status is actually 'failed' before allowing restart
  // if (item.status !== 'failed') {
  //   return { success: false, message: `Restart failed: Item ${itemId} is not in 'failed' state.` };
  // }

  const filecode = item.filemoon_url;

  try {
    const apiUrl = `https://filemoonapi.com/api/encoding/restart?key=${apiKey}&file_code=${filecode}`;
    console.log(`Restart Encoding: Calling API for item ${itemId} (Filecode: ${filecode}) -> ${apiUrl}`);
    const response = await axios.get(apiUrl, { timeout: 10000 }); // 10s timeout

    if (response.data?.status !== 200) {
      throw new Error(`Filemoon API returned non-200 status: ${response.data?.status} - ${response.data?.msg}`);
    }

    console.log(`Restart Encoding: API success for item ${itemId}. Msg: ${response.data?.msg}`);

    // If successful, update local status back to 'uploaded' to allow polling again
    // Reset progress and update message
    stmtUpdateEncodingStatus.run(
      'uploaded', // Reset status to allow polling again
      null,       // Reset progress
      'Encoding restart requested.', // New message
      Date.now(),
      item.id
    );
    console.log(`Restart Encoding: Updated item ${itemId} status to 'uploaded' in DB.`);

    return { success: true, message: response.data?.msg || 'Encoding restart request successful.' };

  } catch (error: any) {
    console.error(`Restart Encoding Failed: API call error for item ${itemId} (Filecode: ${filecode}):`, error.response?.data || error.message || error);
    let errorMessage = 'Failed to request encoding restart.';
    if (axios.isAxiosError(error)) {
        errorMessage = `Filemoon API error: ${error.response?.status} - ${error.response?.data?.msg || error.message}`;
    } else if (error instanceof Error) {
        errorMessage = `Restart error: ${error.message}`;
    }
    // Do NOT change the local status if the API call fails
    return { success: false, message: errorMessage };
  }
}

// Start the polling loop
setInterval(pollEncodingStatus, POLLING_INTERVAL);
// Run once on startup after a short delay 