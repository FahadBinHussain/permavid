import Database from 'better-sqlite3';
import path from 'path';
import fsPromises from 'fs/promises'; // Rename promise version
import fs from 'fs'; // Import standard fs for sync operations
import { execFile } from 'child_process';
import { promisify } from 'util';
import axios from 'axios'; // <-- Add axios
import FormData from 'form-data'; // <-- Add form-data
import { ChildProcess } from 'child_process'; // <-- Add import for ChildProcess

const execFileAsync = promisify(execFile);

// --- Configuration ---
const dbPath = path.resolve(process.cwd(), 'permavid_local.sqlite'); // DB file location
const downloadDir = path.resolve(process.cwd(), 'downloads'); // Local download dir
const DELETE_AFTER_UPLOAD = true; // <-- Simple flag to control deletion

// Track active download processes by item ID
const activeDownloads = new Map<string, ChildProcess>();

// --- Database Setup ---
let db: Database.Database;
try {
  // Ensure the directory for the database exists (though CWD should always exist)
  // Use synchronous fs operations here as it's part of critical startup
  try { fs.mkdirSync(path.dirname(dbPath), { recursive: true }); } catch (e) { /* ignore */ }

  db = new Database(dbPath, { /* verbose: console.log */ }); // Add verbose for debugging if needed

  // Enable WAL mode for better concurrency (though less critical in this local app)
  db.pragma('journal_mode = WAL');

  // Create the queue table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE, -- Prevent adding the exact same URL twice
      status TEXT NOT NULL DEFAULT 'queued', -- queued, downloading, completed, failed, uploading, uploaded
      title TEXT,
      message TEXT, -- Error messages or progress info
      local_path TEXT, -- Path to the downloaded video file
      info_json_path TEXT, -- Path to the .info.json file
      filemoon_url TEXT, -- URL after uploading to Filemoon (optional)
      added_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  console.log(`SQLite database initialized at: ${dbPath}`);

} catch (dbError) {
  console.error("------------------------------------------");
  console.error("FATAL: Could not initialize SQLite database!");
  console.error(dbError);
  console.error(`Database path: ${dbPath}`);
  console.error("Ensure the application has write permissions to this location.");
  console.error("------------------------------------------");
  // If the DB fails, throw an error to prevent the app from starting incorrectly
  throw new Error(`Failed to initialize database: ${dbError}`);
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
const stmtClearCompleted = db.prepare("DELETE FROM queue WHERE status = 'completed'");
const stmtClearFailed = db.prepare("DELETE FROM queue WHERE status = 'failed'");
const stmtClearFinished = db.prepare("DELETE FROM queue WHERE status = 'completed' OR status = 'failed'");
// Add statement to get a specific item by ID
const stmtGetItemById = db.prepare('SELECT * FROM queue WHERE id = ?');
// Add statement to delete a specific item by ID
const stmtDeleteItemById = db.prepare('DELETE FROM queue WHERE id = ?');
// Add statement to clear cancelled items
const stmtClearCancelled = db.prepare("DELETE FROM queue WHERE status = 'cancelled'");

// --- Queue Item Type (Matches DB) ---
export interface QueueItem {
    id: string;
    url: string;
    status: 'queued' | 'downloading' | 'completed' | 'failed' | 'uploading' | 'uploaded' | 'cancelled';
    title?: string | null;
    message?: string | null;
    local_path?: string | null;
    info_json_path?: string | null;
    filemoon_url?: string | null; // Will store the filecode after upload
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
  try {
    // Mark as downloading
    stmtMarkDownloading.run('downloading', 'Download starting...', startTime, itemToProcess.id);
    console.log(`Processing item from DB: ${itemToProcess.id} - ${itemToProcess.url}`);

    // Start the download
    const downloadPromise = downloadVideo(itemToProcess);

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

async function downloadVideo(item: QueueItem): Promise<DownloadResult> {
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
        
        // Use execFile directly instead of the promisified version so we can get the child process
        return new Promise((resolve, reject) => {
            childProcess = execFile('yt-dlp.exe', args, { timeout: 1800000, encoding: 'utf-8' }, 
                (error, stdout, stderr) => {
                // Remove this process from activeDownloads when it completes
                activeDownloads.delete(item.id);
                
                if (error) {
                    // Check if this was a cancellation
                    if (error.killed) {
                        console.log(`Download process for ${item.id} was cancelled.`);
                        return resolve({
                            success: false,
                            message: 'Download cancelled by user.',
                            title: videoTitle
                        });
                    }
                    
                    console.error(`yt-dlp error for ${item.id}:`, error);
                    return reject(error);
                }
                
                if (stderr) {
                    console.error('yt-dlp stderr:', stderr);
                    if (stderr.includes('ERROR:')) {
                        const errorMatch = stderr.match(/ERROR:(.*)/);
                        return reject(new Error(`yt-dlp error: ${errorMatch ? errorMatch[1].trim() : stderr}`));
                    }
                    // Consider other stderr content as warnings/info
                }
                
                console.log('yt-dlp stdout:', stdout);
                
                // After successful download, verify files
                (async () => {
                    try {
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
                            // Neither video nor info file found
                            return reject(new Error('Download finished according to yt-dlp, but no video or info.json file found.'));
                        } else if (!videoFile && infoJsonPath) {
                            // Only info file found
                            console.warn(`Video file starting with '${safeTitle}' not found, but info.json exists.`);
                            return resolve({
                                success: true, // Consider metadata download a partial success
                                message: 'Metadata downloaded, video file missing/failed.',
                                title: videoTitle,
                                local_path: undefined,
                                info_json_path: infoJsonPath
                            });
                        } else if (videoFile) {
                            localVideoPath = path.join(downloadDir, videoFile);
                            console.log(`Found video file: ${localVideoPath}`);
                            return resolve({
                                success: true,
                                message: `Download complete: ${videoFile ?? 'Metadata only'}`,
                                title: videoTitle,
                                local_path: localVideoPath || undefined, // Return path or undefined
                                info_json_path: infoJsonPath || undefined
                            });
                        }
                    } catch (verifyError) {
                        reject(verifyError);
                    }
                })();
            });
            
            // Store the child process for potential cancellation
            activeDownloads.set(item.id, childProcess);
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

// --- Filemoon Upload Logic (Direct Upload Implementation) ---

export async function uploadToFilemoon(itemId: string): Promise<{ success: boolean, message: string, filecode?: string }> {
    const apiKey = process.env.FILEMOON_API_KEY;
    if (!apiKey) {
        console.error('Filemoon API key not found in environment variables (FILEMOON_API_KEY).');
        return { success: false, message: 'Upload failed: Filemoon API key is missing.' };
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

        let lastProgressUpdate = 0; // Track timestamp of last DB update
        const updateInterval = 1000; // Update DB at most every 1 second

        // 5. Upload File
        console.log(`Item ${itemId}: Uploading file ${filePath} to ${uploadUrl}...`);
        const uploadResponse = await axios.post(uploadUrl, formData, {
            headers: formData.getHeaders(), // Pass necessary headers
            maxContentLength: Infinity, // Allow large file uploads
            maxBodyLength: Infinity,
            // Add progress handler
            onUploadProgress: (progressEvent) => {
                if (progressEvent.total) {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    const now = Date.now();
                    // Throttle DB updates
                    if (now - lastProgressUpdate > updateInterval || percentCompleted === 100) {
                        const progressMessage = `Uploading: ${percentCompleted}%`;
                        try {
                            stmtUpdateUploadProgress.run(progressMessage, now, item.id);
                            lastProgressUpdate = now;
                            // Optional: Log progress update to console
                            // console.log(`Item ${itemId}: ${progressMessage}`);
                        } catch (dbError) {
                            console.error(`Item ${itemId}: Failed to update upload progress in DB:`, dbError);
                        }
                    }
                }
            }
        });

        console.log(`Item ${itemId}: Upload response status: ${uploadResponse.status}`);
        console.log(`Item ${itemId}: Upload response data:`, uploadResponse.data);

        if (uploadResponse.data?.status !== 200 || !uploadResponse.data?.files || uploadResponse.data.files.length === 0) {
            throw new Error(`Filemoon upload failed after request. Status: ${uploadResponse.data?.status}, Msg: ${uploadResponse.data?.msg}`);
        }

        const uploadedFile = uploadResponse.data.files[0];
        if (uploadedFile?.status !== 'OK' || !uploadedFile?.filecode) {
             throw new Error(`Filemoon upload result indicates failure. File status: ${uploadedFile?.status}, Filecode: ${uploadedFile?.filecode}`);
        }

        const filecode = uploadedFile.filecode;
        const filemoonUrl = `https://filemoon.to/${filecode}`; // Construct a basic URL, might need adjustment
        console.log(`Item ${itemId}: Upload successful! Filecode: ${filecode}, URL: ${filemoonUrl}`);

        // 6. Update DB to 'uploaded'
        stmtUpdateAfterUpload.run('uploaded', filecode, `Upload successful. Filecode: ${filecode}`, Date.now(), item.id);

        // 7. Optional: Delete local file if configured
        if (DELETE_AFTER_UPLOAD) {
            console.log(`Item ${itemId}: Deleting local files after successful upload...`);
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
    console.log(`Cleared ${result.changes} failed items from DB.`);
    return { success: true, count: result.changes, message: `Cleared ${result.changes} failed items.` };
  } catch (error: any) {
    console.error('Failed to clear failed items:', error);
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