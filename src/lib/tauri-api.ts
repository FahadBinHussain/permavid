import { invoke } from '@tauri-apps/api/tauri';

// Type definitions
export interface QueueItem {
  id?: string;
  url: string;
  status: string;
  message?: string;
  title?: string;
  filemoon_url?: string;
  files_vc_url?: string;
  encoding_progress?: number;
  thumbnail_url?: string;
  added_at?: number;
  updated_at?: number;
}

export interface AppSettings {
  filemoon_api_key?: string;
  files_vc_api_key?: string;
  download_directory?: string;
  delete_after_upload?: string;
  auto_upload?: string;
  upload_target?: string;
}

// Queue related functions
export async function getQueueItems() {
  try {
    const response = await invoke('get_queue_items');
    if (typeof response === 'object' && response !== null && 'data' in response) {
      return (response as any).data || [];
    }
    return [];
  } catch (error) {
    console.error('Error fetching queue from Tauri:', error);
    return [];
  }
}

export async function addQueueItem(item: QueueItem) {
  try {
    const response = await invoke('add_queue_item', { item });
    if (typeof response === 'object' && response !== null && 'data' in response) {
      return (response as any).data || "";
    }
    return "";
  } catch (error) {
    console.error('Error adding queue item via Tauri:', error);
    throw error;
  }
}

export async function updateQueueItem(item: QueueItem) {
  try {
    await invoke('update_queue_item', { item });
  } catch (error) {
    console.error('Error updating queue item via Tauri:', error);
    throw error;
  }
}

export async function updateItemStatus(id: string, status: string, message?: string) {
  try {
    await invoke('update_item_status', { id, status, message });
  } catch (error) {
    console.error('Error updating item status via Tauri:', error);
    throw error;
  }
}

export async function clearCompletedItems(statusTypes: string[]) {
  try {
    await invoke('clear_completed_items', { status_types: statusTypes });
  } catch (error) {
    console.error('Error clearing completed items via Tauri:', error);
    throw error;
  }
}

// Settings related functions
export async function getSettings() {
  try {
    const response = await invoke('get_settings');
    
    // Add debug logging
    console.log('Settings response:', response);
    
    if (typeof response === 'object' && response !== null && 'data' in response) {
      // Ensure we're returning a valid object, even if data is null or undefined
      return (response as any).data || {};
    }
    
    console.warn('Unexpected response format from get_settings:', response);
    return {};
  } catch (error) {
    // More detailed error logging
    console.error('Error fetching settings from Tauri:', error);
    
    // Return an empty object instead of throwing
    return {};
  }
}

export async function saveSettings(settings: AppSettings) {
  try {
    await invoke('save_settings', { settings });
  } catch (error) {
    console.error('Error saving settings via Tauri:', error);
    throw error;
  }
}

// Utility functions
export async function getDownloadDirectory() {
  try {
    const response = await invoke('get_download_directory');
    if (typeof response === 'object' && response !== null && 'data' in response) {
      return (response as any).data || "";
    }
    return "";
  } catch (error) {
    console.error('Error getting download directory via Tauri:', error);
    return "";
  }
}

// Function to open external links
export async function openExternalLink(url: string) {
  try {
    await invoke('open_external_link', { url });
  } catch (error) {
    console.error('Error opening external link:', error);
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
    await invoke('import_from_file', { path });
  } catch (error) {
    console.error('Error importing from file:', error);
    throw error;
  }
} 