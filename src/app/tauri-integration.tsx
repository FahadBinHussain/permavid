'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useMemo, useCallback } from 'react';
import { 
  isTauri,
  QueueItem,
  AppSettings,
  getQueueItems,
  addQueueItem,
  updateQueueItem,
  updateItemStatus,
  clearCompletedItems,
  getSettings,
  saveSettings,
  openExternalLink,
  getDownloadDirectory,
  importFromFile,
  retryItem,
  triggerUpload,
  cancelItem,
  restartEncoding,
  getGalleryItems
} from '@/lib/tauri-api';
import { createEmptySettings } from '@/lib/settings-helper';
import { fetch as tauriFetch, Body } from '@tauri-apps/api/http'; // Import Tauri fetch AND Body

// Define context value type
interface TauriContextType {
  isReady: boolean;
  isTauriEnvironment: boolean;
  queueItems: QueueItem[];
  fetchQueueItems: () => Promise<void>;
  addToQueue: (item: QueueItem) => Promise<string>;
  updateItem: (item: QueueItem) => Promise<void>;
  updateStatus: (id: string, status: string, message?: string) => Promise<void>;
  clearItems: (statusTypes: string[]) => Promise<void>;
  getAppSettings: () => Promise<AppSettings>;
  saveAppSettings: (settings: AppSettings) => Promise<void>;
  openLink: (url: string) => Promise<void>;
  getDefaultDownloadDir: () => Promise<string>;
  importFromFile: (path: string) => Promise<void>;
  retryItem: (id: string) => Promise<void>;
  triggerUpload: (id: string) => Promise<{success: boolean, message: string}>;
  cancelItem: (id: string) => Promise<{success: boolean, message: string}>;
  restartEncoding: (id: string) => Promise<{success: boolean, message: string}>;
  getGalleryItems: () => Promise<{success: boolean, message: string, data?: QueueItem[]}>;
  contributeIdentifier: (url: string) => Promise<{success: boolean, error?: string}>;
}

// Create context with default values
const TauriContext = createContext<TauriContextType>({
  isReady: false,
  isTauriEnvironment: false,
  queueItems: [],
  fetchQueueItems: async () => {},
  addToQueue: async () => "",
  updateItem: async () => {},
  updateStatus: async () => {},
  clearItems: async () => {},
  getAppSettings: async () => createEmptySettings(),
  saveAppSettings: async () => {},
  openLink: async () => {},
  getDefaultDownloadDir: async () => "",
  importFromFile: async () => {},
  retryItem: async () => {},
  triggerUpload: async () => ({success: false, message: 'Provider not ready'}),
  cancelItem: async () => ({success: false, message: 'Provider not ready'}),
  restartEncoding: async () => ({success: false, message: 'Provider not ready'}),
  getGalleryItems: async () => ({success: false, message: 'Provider not ready', data: []}),
  contributeIdentifier: async () => ({success: false, error: 'Provider not ready'}),
});

// --- PLACEHOLDER: Replace with your actual Vercel deployment URL --- 
const PUBLIC_INDEX_SERVER_BASE_URL = 'https://permavid.vercel.app/api'; 
// --- END PLACEHOLDER ---

// --- ADDED: API Client function to contribute identifier --- 
async function contributeIdentifier(url: string): Promise<{success: boolean; error?: string}> {
  if (!PUBLIC_INDEX_SERVER_BASE_URL || PUBLIC_INDEX_SERVER_BASE_URL.includes('your-permavid-index')) {
    console.warn('Public index server URL is not configured. Skipping contribution.');
    return { success: false, error: 'Server URL not configured' };
  }

  const endpoint = `${PUBLIC_INDEX_SERVER_BASE_URL}/add`;
  console.log(`Attempting to contribute identifier for URL: ${url} to ${endpoint}`);

  try {
    const response = await tauriFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: Body.json({ url }), // Use Body.json()
      timeout: 15000 // 15 second timeout
    });

    console.log('Contribution response status:', response.status);
    console.log('Contribution response data:', response.data);

    if (!response.ok) {
      // Try to parse error message from response data
      let errorMessage = `Server responded with status ${response.status}`;
      if (typeof response.data === 'object' && response.data !== null && (response.data as any).message) {
        errorMessage = (response.data as any).message;
      }
      console.error('Failed to contribute identifier:', errorMessage);
      return { success: false, error: errorMessage };
    }

    console.log(`Successfully contributed identifier for: ${url}`);
    return { success: true };

  } catch (error: any) {
    console.error('Error calling contribute identifier endpoint:', error);
    return { success: false, error: error.message || 'Network error or failed to fetch' };
  }
}
// --- END ADDED ---

// Provider component
export function TauriProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isTauriEnvironment, setIsTauriEnvironment] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);

  const fetchQueueItems = useCallback(async () => {
    try {
      const items = await getQueueItems();
      setQueueItems(items);
    } catch (err) {
      console.error("Error fetching queue items:", err);
    }
  }, []);

  const getAppSettings = useCallback(async (): Promise<AppSettings> => {
    try {
      console.log("Fetching application settings...");
      const appSettings = await getSettings();
      console.log("Settings received:", appSettings);
      return appSettings || createEmptySettings();
    } catch (err) {
      console.error("Error fetching settings:", err);
      return createEmptySettings();
    }
  }, []);

  const saveAppSettings = useCallback(async (newSettings: AppSettings) => {
    await saveSettings(newSettings);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const tauriAvailable = isTauri();
      setIsTauriEnvironment(tauriAvailable);
      
      try {
        // Initial data load
        await Promise.all([
          fetchQueueItems(),
          getAppSettings(),
        ]);
      } catch (err) {
        console.error("Error initializing Tauri integration:", err);
      } finally {
        setIsReady(true);
      }
    };

    initialize();
  }, [fetchQueueItems, getAppSettings]);

  const addToQueue = useCallback(async (item: QueueItem) => {
    const id = await addQueueItem(item);
    await fetchQueueItems();
    return id;
  }, [fetchQueueItems]);

  const updateItem = useCallback(async (item: QueueItem) => {
    await updateQueueItem(item);
    await fetchQueueItems();
  }, [fetchQueueItems]);

  const updateStatus = useCallback(async (id: string, status: string, message?: string) => {
    await updateItemStatus(id, status, message);
    await fetchQueueItems();
  }, [fetchQueueItems]);

  const clearItems = useCallback(async (statusTypes: string[]) => {
    await clearCompletedItems(statusTypes);
    await fetchQueueItems();
  }, [fetchQueueItems]);

  const openLink = useCallback(async (url: string) => {
    await openExternalLink(url);
  }, []);

  const getDefaultDownloadDir = useCallback(async () => {
    if (isTauriEnvironment) {
      return await getDownloadDirectory();
    }
    return "";
  }, [isTauriEnvironment]);

  const handleImportFromFile = useCallback(async (path: string) => {
    try {
      await importFromFile(path);
      await fetchQueueItems();
      await getAppSettings();
    } catch (err) {
      console.error("Error importing data:", err);
    }
  }, [fetchQueueItems, getAppSettings]);

  const handleRetryItem = useCallback(async (id: string) => {
    try {
      await retryItem(id);
      await fetchQueueItems();
    } catch (err) {
      console.error(`Error retrying item ${id}:`, err);
    }
  }, [fetchQueueItems]);

  const handleTriggerUpload = useCallback(async (id: string) => {
    const result = await triggerUpload(id);
    await fetchQueueItems();
    return result;
  }, [fetchQueueItems]);

  const handleCancelItem = useCallback(async (id: string) => {
    const result = await cancelItem(id);
    await fetchQueueItems();
    return result;
  }, [fetchQueueItems]);

  const handleRestartEncoding = useCallback(async (id: string) => {
    const result = await restartEncoding(id);
    await fetchQueueItems();
    return result;
  }, [fetchQueueItems]);

  const handleGetGalleryItems = useCallback(async () => {
    const result = await getGalleryItems();
    return result;
  }, []);

  const memoizedContributeIdentifier = useCallback(async (url: string) => {
    if (!isTauriEnvironment) return { success: false, error: 'Not in Tauri environment' };
    return contributeIdentifier(url);
  }, [isTauriEnvironment]);

  const contextValue = useMemo(() => ({
    isReady,
    isTauriEnvironment,
    queueItems,
    fetchQueueItems,
    addToQueue,
    updateItem,
    updateStatus,
    clearItems,
    getAppSettings,
    saveAppSettings,
    openLink,
    getDefaultDownloadDir,
    importFromFile: handleImportFromFile,
    retryItem: handleRetryItem,
    triggerUpload: handleTriggerUpload,
    cancelItem: handleCancelItem,
    restartEncoding: handleRestartEncoding,
    getGalleryItems: handleGetGalleryItems,
    contributeIdentifier: memoizedContributeIdentifier,
  }), [
    isReady, isTauriEnvironment, queueItems,
    fetchQueueItems, addToQueue, updateItem, updateStatus, clearItems,
    getAppSettings, saveAppSettings, openLink, getDefaultDownloadDir,
    handleImportFromFile, handleRetryItem, handleTriggerUpload,
    handleCancelItem, handleRestartEncoding, handleGetGalleryItems,
    memoizedContributeIdentifier
  ]);

  return (
    <TauriContext.Provider value={contextValue}>
      {children}
    </TauriContext.Provider>
  );
}

// Custom hook to use the context
export function useTauri() {
  return useContext(TauriContext);
} 