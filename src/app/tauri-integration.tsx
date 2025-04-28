'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

// Define context value type
interface TauriContextType {
  isReady: boolean;
  isTauriEnvironment: boolean;
  queueItems: QueueItem[];
  settings: AppSettings;
  fetchQueueItems: () => Promise<void>;
  addToQueue: (item: QueueItem) => Promise<string>;
  updateItem: (item: QueueItem) => Promise<void>;
  updateStatus: (id: string, status: string, message?: string) => Promise<void>;
  clearItems: (statusTypes: string[]) => Promise<void>;
  getAppSettings: () => Promise<void>;
  saveAppSettings: (settings: AppSettings) => Promise<void>;
  openLink: (url: string) => Promise<void>;
  getDefaultDownloadDir: () => Promise<string>;
  importFromFile: (path: string) => Promise<void>;
  retryItem: (id: string) => Promise<void>;
  triggerUpload: (id: string) => Promise<{success: boolean, message: string}>;
  cancelItem: (id: string) => Promise<{success: boolean, message: string}>;
  restartEncoding: (id: string) => Promise<{success: boolean, message: string}>;
  getGalleryItems: () => Promise<{success: boolean, message: string, data?: QueueItem[]}>;
}

// Create context with default values
const TauriContext = createContext<TauriContextType>({
  isReady: false,
  isTauriEnvironment: false,
  queueItems: [],
  settings: {},
  fetchQueueItems: async () => {},
  addToQueue: async () => "",
  updateItem: async () => {},
  updateStatus: async () => {},
  clearItems: async () => {},
  getAppSettings: async () => {},
  saveAppSettings: async () => {},
  openLink: async () => {},
  getDefaultDownloadDir: async () => "",
  importFromFile: async () => {},
  retryItem: async () => {},
  triggerUpload: async () => ({success: false, message: 'Provider not ready'}),
  cancelItem: async () => ({success: false, message: 'Provider not ready'}),
  restartEncoding: async () => ({success: false, message: 'Provider not ready'}),
  getGalleryItems: async () => ({success: false, message: 'Provider not ready', data: []})
});

// Provider component
export function TauriProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isTauriEnvironment, setIsTauriEnvironment] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>({});

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
  }, []);

  const fetchQueueItems = async () => {
    try {
      const items = await getQueueItems();
      setQueueItems(items);
    } catch (err) {
      console.error("Error fetching queue items:", err);
    }
  };

  const addToQueue = async (item: QueueItem) => {
    const id = await addQueueItem(item);
    await fetchQueueItems();
    return id;
  };

  const updateItem = async (item: QueueItem) => {
    await updateQueueItem(item);
    await fetchQueueItems();
  };

  const updateStatus = async (id: string, status: string, message?: string) => {
    await updateItemStatus(id, status, message);
    await fetchQueueItems();
  };

  const clearItems = async (statusTypes: string[]) => {
    await clearCompletedItems(statusTypes);
    await fetchQueueItems();
  };

  const getAppSettings = async () => {
    try {
      console.log("Fetching application settings...");
      const appSettings = await getSettings();
      console.log("Settings received:", appSettings);
      setSettings(appSettings || {});
    } catch (err) {
      console.error("Error fetching settings:", err);
      // Ensure we always have a valid settings object
      setSettings({});
    }
  };

  const saveAppSettings = async (newSettings: AppSettings) => {
    await saveSettings(newSettings);
    setSettings(newSettings);
  };

  const openLink = async (url: string) => {
    await openExternalLink(url);
  };

  const getDefaultDownloadDir = async () => {
    if (isTauriEnvironment) {
      return await getDownloadDirectory();
    }
    return "";
  };

  const handleImportFromFile = async (path: string) => {
    try {
      await importFromFile(path);
      // Refresh data after import
      await fetchQueueItems();
      await getAppSettings();
    } catch (err) {
      console.error("Error importing data:", err);
    }
  };

  const handleRetryItem = async (id: string) => {
    try {
      await retryItem(id);
      // Refresh queue data after retry
      await fetchQueueItems();
    } catch (err) {
      console.error(`Error retrying item ${id}:`, err);
      // Optionally show an error message to the user
    }
  };

  const handleTriggerUpload = async (id: string) => {
    // Invoke the Tauri command via the API wrapper
    const result = await triggerUpload(id);
    // Refresh queue data after upload attempt
    await fetchQueueItems(); 
    // Return the result so the UI can display messages/errors
    return result; 
  };

  const handleCancelItem = async (id: string) => {
    // Invoke the Tauri command via the API wrapper
    const result = await cancelItem(id);
    // Refresh queue data after cancel attempt
    await fetchQueueItems(); 
    // Return the result so the UI can display messages/errors
    return result; 
  };

  const handleRestartEncoding = async (id: string) => {
    // Invoke the Tauri command via the API wrapper
    const result = await restartEncoding(id);
    // Refresh queue data after restart attempt
    await fetchQueueItems(); 
    // Return the result so the UI can display messages/errors
    return result; 
  };

  const handleGetGalleryItems = async () => {
    // Invoke the Tauri command via the API wrapper
    const result = await getGalleryItems();
    // Return the result so the UI can use the data/messages/errors
    return result; 
  };

  return (
    <TauriContext.Provider value={{
      isReady,
      isTauriEnvironment,
      queueItems,
      settings,
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
      getGalleryItems: handleGetGalleryItems
    }}>
      {children}
    </TauriContext.Provider>
  );
}

// Custom hook to use the context
export function useTauri() {
  return useContext(TauriContext);
} 