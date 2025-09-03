import { sql, getCurrentUserId } from "./db";
import { AppSettings } from "@/lib/tauri-api";

/**
 * Retrieves a specific setting value from the database.
 * @param key The key of the setting to retrieve.
 * @param isGlobal Whether to retrieve a global setting (not user-specific).
 * @returns The setting value or undefined if not found.
 */
export async function getSetting(
  key: string,
  isGlobal: boolean = false,
): Promise<string | undefined> {
  try {
    let result;

    if (isGlobal) {
      // Get global setting (no user_id)
      result =
        await sql`SELECT value FROM settings WHERE key = ${key} AND user_id IS NULL`;
    } else {
      // Get user-specific setting
      const userId = await getCurrentUserId();
      result =
        await sql`SELECT value FROM settings WHERE key = ${key} AND user_id = ${userId}`;
    }

    return result.length > 0 ? result[0].value : undefined;
  } catch (error) {
    console.error(`Error retrieving setting ${key}:`, error);
    return undefined;
  }
}

/**
 * Sets a setting value in the database.
 * @param key The key of the setting to set.
 * @param value The value to set.
 * @param isGlobal Whether to set a global setting (not user-specific).
 * @returns True if successful, false otherwise.
 */
export async function setSetting(
  key: string,
  value: string,
  isGlobal: boolean = false,
): Promise<boolean> {
  try {
    if (isGlobal) {
      // Set global setting (no user_id)
      await sql`
        INSERT INTO settings (key, value, user_id)
        VALUES (${key}, ${value}, NULL)
        ON CONFLICT (key) WHERE user_id IS NULL DO UPDATE SET value = ${value}
      `;
    } else {
      // Set user-specific setting
      const userId = await getCurrentUserId();
      await sql`
        INSERT INTO settings (key, value, user_id)
        VALUES (${key}, ${value}, ${userId})
        ON CONFLICT (key, user_id) DO UPDATE SET value = ${value}
      `;
    }
    return true;
  } catch (error) {
    console.error(`Error setting ${key}:`, error);
    return false;
  }
}

/**
 * Retrieves all settings from the database for the current user.
 * @param includeGlobal Whether to include global settings.
 * @returns An object containing all settings as key-value pairs.
 */
export async function getAllSettings(
  includeGlobal: boolean = true,
): Promise<Record<string, string>> {
  try {
    const userId = await getCurrentUserId();
    let results;

    if (includeGlobal) {
      // Get both user-specific and global settings
      results = await sql`
        SELECT key, value FROM settings
        WHERE user_id = ${userId} OR user_id IS NULL
      `;
    } else {
      // Get only user-specific settings
      results = await sql`
        SELECT key, value FROM settings
        WHERE user_id = ${userId}
      `;
    }

    const settings: Record<string, string> = {};

    for (const row of results) {
      settings[row.key] = row.value;
    }

    return settings;
  } catch (error) {
    console.error("Error retrieving all settings:", error);
    return {};
  }
}

/**
 * Retrieves application settings from the database.
 * @returns An AppSettings object with the current settings.
 */
export async function getAppSettings(): Promise<AppSettings> {
  // Get user-specific settings
  const userSettingsStr = await getSetting("user_settings");
  let userSettings = {};

  if (userSettingsStr) {
    try {
      userSettings = JSON.parse(userSettingsStr);
    } catch (error) {
      console.error("Error parsing user settings:", error);
    }
  }

  // Default settings if not found
  return {
    filemoon_api_key: "",
    download_directory: "./downloads",
    delete_after_upload: "false",
    auto_upload: "false",
    upload_target: "none",
    ...userSettings,
  };
}

/**
 * Saves application settings to the database.
 * @param settings The AppSettings object to save.
 * @returns True if successful, false otherwise.
 */
export async function saveAppSettings(settings: AppSettings): Promise<boolean> {
  try {
    // Convert settings to JSON string
    const settingsJson = JSON.stringify(settings);

    // Save as user settings
    return await setSetting("user_settings", settingsJson);
  } catch (error) {
    console.error("Error saving application settings:", error);
    return false;
  }
}
