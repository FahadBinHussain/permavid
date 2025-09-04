import { invoke } from "@tauri-apps/api/tauri";
import { getCurrentUserId } from "./db";

// Type definitions
export interface QueueItem {
  id?: string;
  url: string;
  status: string;
  message?: string;
  title?: string;
  filemoon_url?: string;
  encoding_progress?: number;
  thumbnail_url?: string;
  added_at?: number;
  updated_at?: number;
  local_path?: string;
  user_id?: string;
  is_public?: boolean;
}

export interface AppSettings {
  filemoon_api_key?: string;
  download_directory?: string;
  delete_after_upload?: string;
  auto_upload?: string;
  upload_target?: string;
}

// Define the expected structure of the response from the trigger_upload command
interface UploadResponse {
  success: boolean;
  message: string;
  data?: string; // Assuming data contains the item ID on success
}

// Queue related functions
export async function getQueueItems() {
  try {
    const userId = await getCurrentUserId();
    const response = await invoke("get_queue_items", { userId });
    if (
      typeof response === "object" &&
      response !== null &&
      "data" in response
    ) {
      return (response as any).data || [];
    }
    return [];
  } catch (error) {
    console.error("Error fetching queue from Tauri:", error);
    return [];
  }
}

export async function addQueueItem(item: QueueItem) {
  try {
    const userId = await getCurrentUserId();
    const id: string = await invoke("add_queue_item", { item, userId });
    return id;
  } catch (err: any) {
    // Convert error to string for checking
    const errorString = String(err);
    // Check if it's one of the expected duplicate/archived errors
    if (
      errorString.includes("already exists in the active queue") ||
      errorString.includes("has already been archived")
    ) {
      // Re-throw only the message string for graceful handling in UI
      throw errorString;
    } else {
      // Re-throw other unexpected errors and log them
      console.error("Unexpected error adding queue item via Tauri:", err);
      throw err;
    }
  }
}

export async function updateQueueItem(item: QueueItem) {
  try {
    await invoke("update_queue_item", { item });
  } catch (error) {
    console.error("Error updating queue item via Tauri:", error);
    throw error;
  }
}

export async function updateItemStatus(
  id: string,
  status: string,
  message?: string,
) {
  try {
    await invoke("update_item_status", { id, status, message });
  } catch (error) {
    console.error("Error updating item status via Tauri:", error);
    throw error;
  }
}

export async function clearCompletedItems(statusTypes: string[]) {
  try {
    console.log(
      "[Tauri API] Calling clear_completed_items with direct array:",
      JSON.stringify(statusTypes),
    );
    const userId = await getCurrentUserId();
    await invoke("clear_completed_items", { statusTypes, userId });
  } catch (error) {
    console.error("Error clearing completed items via Tauri:", error);
    throw error;
  }
}

// Settings related functions
export async function getSettings(userId?: string) {
  try {
    const currentUserId = userId || (await getCurrentUserId());
    const response = await invoke("get_settings", {
      userId: currentUserId,
    });

    // Add debug logging
    console.log("Settings response:", response);

    if (
      typeof response === "object" &&
      response !== null &&
      "data" in response
    ) {
      // Ensure we're returning a valid object, even if data is null or undefined
      return (response as any).data || {};
    }

    console.warn("Unexpected response format from get_settings:", response);
    return {};
  } catch (error) {
    // More detailed error logging
    console.error("Error fetching settings from Tauri:", error);

    // Return an empty object instead of throwing
    return {};
  }
}

export async function saveSettings(settings: AppSettings, userId?: string) {
  try {
    const currentUserId = userId || (await getCurrentUserId());
    await invoke("save_settings", {
      settings,
      userId: currentUserId,
    });
  } catch (error) {
    console.error("Error saving settings via Tauri:", error);
    throw error;
  }
}

// Utility functions
export async function getDownloadDirectory() {
  try {
    const response = await invoke("get_download_directory");
    if (
      typeof response === "object" &&
      response !== null &&
      "data" in response
    ) {
      return (response as any).data || "";
    }
    return "";
  } catch (error) {
    console.error("Error getting download directory via Tauri:", error);
    return "";
  }
}

// Function to open external links
export async function openExternalLink(url: string) {
  try {
    await invoke("open_external_link", { url });
  } catch (error) {
    console.error("Error opening external link:", error);
    throw error;
  }
}

// Helper function to check if we're running in a Tauri environment
export function isTauri() {
  return window !== undefined && window.__TAURI__ !== undefined;
}

// Function to manually import data from a specific file
export async function importFromFile(path: string) {
  try {
    await invoke("import_from_file", { path });
  } catch (error) {
    console.error("Error importing from file:", error);
    throw error;
  }
}

// --- ADDED: Function to retry an item ---
export async function retryItem(id: string): Promise<string> {
  try {
    // Result should be { success: boolean, message: string, data: null }
    const response: any = await invoke("retry_item", { id });
    if (!response || !response.success) {
      return response?.message || "Failed to retry item in backend.";
    }
    // Return the success message
    return response.message;
  } catch (error) {
    // Don't log API key configuration errors to console
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes("API key not configured")) {
      console.error("Error retrying item via Tauri:", error);
    }
    // Return the error message as a string instead of throwing
    return errorMessage;
  }
}
// --- END ADDED ---

// --- ADDED: Function to trigger upload via Tauri ---
export async function triggerUpload(id: string): Promise<UploadResponse> {
  try {
    const userId = await getCurrentUserId();
    // Result should match the Response<String> structure from Rust
    const response: UploadResponse = await invoke("trigger_upload", {
      id,
      userId,
    });
    // No need to check success here, let the caller handle the full response
    return response;
  } catch (error) {
    // Don't log API key configuration errors to console - they're expected and handled in the UI
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes("API key not configured")) {
      console.error("Error triggering upload via Tauri:", error);
    }

    // Ensure a consistent error response structure
    return {
      success: false,
      message: errorMessage,
    };
  }
}
// --- END ADDED ---

// --- ADDED: Function to cancel an item via Tauri ---
export async function cancelItem(
  id: string,
): Promise<{ success: boolean; message: string }> {
  try {
    // Response structure matches Rust Response<()> which becomes { success, message, data: null }
    const response: any = await invoke("cancel_item", { id });
    if (!response || !response.success) {
      throw new Error(response?.message || "Failed to cancel item in backend.");
    }
    return { success: true, message: response.message };
  } catch (error) {
    console.error("Error cancelling item via Tauri:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error cancelling item",
    };
  }
}
// --- END ADDED ---

// --- ADDED: Function to restart encoding via Tauri ---
export async function restartEncoding(
  id: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const userId = await getCurrentUserId();
    // Response structure matches Rust Response<()> which becomes { success, message, data: null }
    const response: any = await invoke("restart_encoding", { id, userId });
    if (!response || !response.success) {
      throw new Error(
        response?.message || "Failed to restart encoding in backend.",
      );
    }
    return { success: true, message: response.message };
  } catch (error) {
    console.error("Error restarting encoding via Tauri:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error restarting encoding",
    };
  }
}
// --- END ADDED ---

// --- ADDED: Function to get gallery items via Tauri ---
export async function getGalleryItems(): Promise<{
  success: boolean;
  message: string;
  data?: QueueItem[];
}> {
  try {
    console.log("[Tauri API] Calling invoke('get_gallery_items')...");
    const userId = await getCurrentUserId();
    // Response structure matches Rust Response<Vec<QueueItem>>
    const response: any = await invoke("get_gallery_items", { userId });

    console.log(
      "[Tauri API] Raw response from get_gallery_items:",
      JSON.stringify(response, null, 2),
    );

    if (!response || !response.success) {
      console.warn(
        "[Tauri API] get_gallery_items response check failed. Response:",
        response,
      );
      throw new Error(
        response?.message || "Failed to get gallery items from backend.",
      );
    }
    console.log("[Tauri API] get_gallery_items successful. Returning data.");
    return {
      success: true,
      message: response.message,
      data: response.data || [],
    };
  } catch (error) {
    console.error("[Tauri API] Error in getGalleryItems catch block:", error);
    return {
      success: false,
      message: `Error fetching gallery items: ${error instanceof Error ? error.message : "Unknown error"}`,
      data: [],
    };
  }
}
// --- END ADDED ---
