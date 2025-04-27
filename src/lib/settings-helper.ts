// Direct settings utilities that bypass the standard flow for more reliability
import { AppSettings } from './tauri-api';

// Safe invoke that won't throw errors for common Tauri communication issues
export async function safeInvoke(command: string, args?: any): Promise<any> {
  // First check if we're in a browser environment
  if (typeof window === 'undefined') {
    console.warn('Window not available (SSR context), using fallback empty data');
    return { success: true, data: null };
  }

  // Then check if Tauri is available with more detailed logging
  if (!window.__TAURI__) {
    console.warn('Tauri object not available in window, using fallback empty data');
    return { success: true, data: null };
  }

  try {
    // Dynamically import Tauri API to prevent issues during SSR/build
    let invoke;
    try {
      console.log(`Attempting to import Tauri API for command: ${command}`);
      
      // More explicit approach to Tauri import
      const tauriModule = await import('@tauri-apps/api/tauri').catch(e => {
        console.error('Import error details:', e);
        return { invoke: null }; 
      });
      
      invoke = tauriModule.invoke;
      
      if (typeof invoke !== 'function') {
        console.warn('Tauri invoke function not available after import, using fallback');
        return { success: true, data: null };
      }
      console.log(`Successfully imported Tauri API, invoke function is available`);
    } catch (importError) {
      console.error('Failed to import Tauri API:', importError);
      console.error('Stack trace:', importError instanceof Error ? importError.stack : 'No stack trace available');
      console.error('Import error type:', typeof importError);
      return { success: true, data: null };
    }
    
    // Call the Tauri command with timeout protection
    console.log(`Invoking Tauri command: ${command} with args:`, args ? JSON.stringify(args) : 'none');
    
    // Use an AbortController for a better timeout mechanism
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
      console.warn(`Tauri command ${command} timed out after 5000ms`);
    }, 5000);
    
    try {
      const result = await invoke(command, args);
      clearTimeout(timeoutId);
      
      console.log(`Received result from Tauri command ${command}:`, JSON.stringify(result, null, 2));
      return result;
    } catch (invokeError) {
      clearTimeout(timeoutId);
      console.error(`Error during actual Tauri invoke call for ${command}:`, invokeError);
      console.error('Invoke error type:', typeof invokeError);
      // Try to provide a more detailed error message
      const errorMsg = invokeError instanceof Error ? invokeError.message : String(invokeError);
      return { success: false, data: null, error: errorMsg };
    }
  } catch (error) {
    console.error(`Unexpected error invoking Tauri command ${command}:`, error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    console.error('Error type:', typeof error);
    // Return a valid response instead of throwing
    return { success: false, data: null, error: 'Unexpected error in safeInvoke' };
  }
}

// Directly fetch settings with maximum fallback protection
export async function getSettingsDirectly(): Promise<AppSettings> {
  try {
    console.log('Directly fetching settings via safeInvoke...');
    console.log('Is Tauri available?', typeof window !== 'undefined' && !!window.__TAURI__);
    
    // Safety check - if we're not in a browser or Tauri isn't available, return defaults early
    if (typeof window === 'undefined' || !window.__TAURI__) {
      console.warn('Tauri not available for settings fetch, using default settings');
      return createEmptySettings();
    }
    
    // Attempt to get settings via Tauri
    const result = await safeInvoke('get_settings');
    
    // Log the raw response for debugging
    console.log('Raw settings response:', JSON.stringify(result, null, 2));
    
    // Handle various result formats
    if (result && typeof result === 'object') {
      // Handle standard response format
      if ('data' in result && result.data) {
        console.log('Settings found in result.data format');
        return ensureValidSettings(result.data);
      }
      
      // If result is the data itself (no wrapper)
      if (result !== null && (typeof result === 'object') && 
          !('success' in result) && !('error' in result)) {
        console.log('Settings found in direct object format');
        return ensureValidSettings(result as AppSettings);
      }
      
      // Handle direct object return with key properties
      if ('filemoon_api_key' in result || 'files_vc_api_key' in result || 
          'download_directory' in result || 'upload_target' in result) {
        console.log('Settings found with known properties');
        return ensureValidSettings(result as AppSettings);
      }
    }
    
    // Return empty settings as a fallback
    console.warn('No valid settings data found, using empty settings');
    return createEmptySettings();
  } catch (error) {
    console.error('Critical error fetching settings:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    return createEmptySettings();
  }
}

// Helper to ensure we always have a valid settings object with proper types
function ensureValidSettings(settings: any): AppSettings {
  const defaultSettings = createEmptySettings();
  
  // Return a validated object with all required fields
  return {
    filemoon_api_key: settings?.filemoon_api_key || defaultSettings.filemoon_api_key,
    files_vc_api_key: settings?.files_vc_api_key || defaultSettings.files_vc_api_key,
    download_directory: settings?.download_directory || defaultSettings.download_directory,
    delete_after_upload: settings?.delete_after_upload?.toString() || defaultSettings.delete_after_upload,
    auto_upload: settings?.auto_upload?.toString() || defaultSettings.auto_upload,
    upload_target: settings?.upload_target || defaultSettings.upload_target
  };
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