import { db } from '@/lib/db'; // Use path alias
import Database from 'better-sqlite3';
import path from 'path'; // Keep path import here for applyDefaultSettings

// Define the structure for settings
interface Settings {
  [key: string]: string | undefined;
}

// --- Initialize Settings Table ---
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  console.log('Settings table initialized successfully.');
} catch (error) {
  console.error('FATAL: Could not initialize settings table!', error);
  throw new Error(`Failed to initialize settings table: ${error}`);
}

// --- Prepare Statements ---
let stmtGetSetting: Database.Statement;
let stmtSetSetting: Database.Statement;
let stmtGetAllSettings: Database.Statement;

try {
  stmtGetSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  // Use INSERT OR REPLACE (UPSERT) to handle both new and existing keys
  stmtSetSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  stmtGetAllSettings = db.prepare('SELECT key, value FROM settings');
} catch (error) {
    console.error('FATAL: Could not prepare settings statements!', error);
    throw new Error(`Failed to prepare settings statements: ${error}`);
}


// --- Settings Functions ---

/**
 * Retrieves a specific setting value from the database.
 * @param key The key of the setting to retrieve.
 * @param defaultValue Optional default value if the setting is not found.
 * @returns The setting value or the default value (or undefined if no default).
 */
export function getSetting(key: string): string | undefined;
export function getSetting<T extends string>(key: string, defaultValue: T): string;
export function getSetting(key: string, defaultValue?: string): string | undefined {
  try {
    const result = stmtGetSetting.get(key) as { value: string } | undefined;
    return result?.value ?? defaultValue;
  } catch (error) {
    console.error(`Error getting setting "${key}":`, error);
    return defaultValue; // Return default on error
  }
}

/**
 * Sets or updates a specific setting in the database.
 * @param key The key of the setting to set.
 * @param value The value to store for the setting.
 */
export function setSetting(key: string, value: string): { success: boolean, message?: string } {
  try {
    // Basic validation: ensure value is a string
    if (typeof value !== 'string') {
        console.warn(`Attempted to set non-string value for setting "${key}". Coercing to string.`);
        value = String(value);
    }
    stmtSetSetting.run(key, value);
    console.log(`Setting updated: ${key} = ${value.length > 50 ? value.substring(0, 50) + '...' : value}`); // Avoid logging huge values
    return { success: true };
  } catch (error: any) {
    console.error(`Error setting setting "${key}":`, error);
    return { success: false, message: error.message };
  }
}

/**
 * Retrieves all settings from the database as an object.
 * @returns An object containing all key-value pairs from the settings table.
 */
export function getAllSettings(): Settings {
  const settings: Settings = {};
  try {
    const rows = stmtGetAllSettings.all() as { key: string; value: string }[];
    rows.forEach(row => {
      settings[row.key] = row.value;
    });
    return settings;
  } catch (error) {
    console.error('Error getting all settings:', error);
    return {}; // Return empty object on error
  }
}

// --- Default Settings (Optional - Apply if not set) ---
function applyDefaultSettings() {
    const defaultDownloadDir = path.resolve(process.cwd(), 'downloads');
    if (getSetting('download_directory') === undefined) {
        setSetting('download_directory', defaultDownloadDir);
    }
    if (getSetting('delete_after_upload') === undefined) {
        setSetting('delete_after_upload', 'true'); // Store boolean as string 'true'/'false'
    }
     if (getSetting('filemoon_api_key') === undefined) {
         // Try reading from env as initial default, but store empty if not found
        setSetting('filemoon_api_key', process.env.FILEMOON_API_KEY || '');
    }
}

// Apply defaults on module load
applyDefaultSettings(); 