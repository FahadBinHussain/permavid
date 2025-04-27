// Direct settings utilities that bypass the standard flow for more reliability
import { AppSettings } from './tauri-api';

// Safe invoke that won't throw errors for common Tauri communication issues
export async function safeInvoke(command: string, args?: any): Promise<any> {
  // First check if we're in a browser environment
  if (typeof window === 'undefined') {
    console.warn('Window not available (SSR context), using fallback empty data');
    return { success: true, data: null };
  }

  // Then check if Tauri is available
  if (!window.__TAURI__) {
    console.warn('Tauri not available, using fallback empty data');
    return { success: true, data: null };
  }

  try {
    // Dynamically import Tauri API to prevent issues during SSR/build
    let invoke;
    try {
      const tauriModule = await import('@tauri-apps/api/tauri');
      invoke = tauriModule.invoke;
      
      if (typeof invoke !== 'function') {
        console.warn('Tauri invoke function not available, using fallback');
        return { success: true, data: null };
      }
    } catch (importError) {
      console.error('Failed to import Tauri API:', importError);
      return { success: true, data: null };
    }
    
    // Call the Tauri command with timeout protection
    const result = await Promise.race([
      invoke(command, args),
      new Promise(resolve => setTimeout(() => {
        console.warn(`Tauri command ${command} timed out after 5000ms`);
        resolve({ success: false, data: null });
      }, 5000))
    ]);
    
    return result;
  } catch (error) {
    console.error(`Error invoking Tauri command ${command}:`, error);
    // Return a valid response instead of throwing
    return { success: true, data: null };
  }
}

// Directly fetch settings with maximum fallback protection
export async function getSettingsDirectly(): Promise<AppSettings> {
  try {
    console.log('Directly fetching settings via safeInvoke...');
    const result = await safeInvoke('get_settings');
    
    // Log the raw response for debugging
    console.log('Raw settings response:', result);
    
    // Handle various result formats
    if (result && typeof result === 'object') {
      // Handle standard response format
      if ('data' in result && result.data) {
        return result.data;
      }
      
      // If result is the data itself (no wrapper)
      if (result !== null && (typeof result === 'object') && 
          !('success' in result) && !('error' in result)) {
        return result as AppSettings;
      }
      
      // Handle direct object return with key properties
      if ('filemoon_api_key' in result || 'files_vc_api_key' in result || 
          'download_directory' in result || 'upload_target' in result) {
        return result as AppSettings;
      }
    }
    
    // Return empty settings as a fallback
    console.warn('No valid settings data found, using empty settings');
    return createEmptySettings();
  } catch (error) {
    console.error('Critical error fetching settings:', error);
    return createEmptySettings();
  }
}

// Helper to ensure we always have a valid settings object
export function createEmptySettings(): AppSettings {
  return {
    filemoon_api_key: '',
    files_vc_api_key: '',
    download_directory: '',
    delete_after_upload: 'false',
    auto_upload: 'false',
    upload_target: 'filemoon'
  };
}

// Helper to attach this function to the window for troubleshooting
export function attachDebugHelpers() {
  if (typeof window !== 'undefined') {
    (window as any).__debugSettings = {
      getSettings: getSettingsDirectly,
      createEmpty: createEmptySettings,
      safeInvoke: safeInvoke
    };
  }
}

// Call this during app initialization
attachDebugHelpers(); 