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
  getGalleryItems: async () => ({success: false, message: 'Provider not ready', data: []})
});

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
    getGalleryItems: handleGetGalleryItems
  }), [
    isReady, isTauriEnvironment, queueItems,
    fetchQueueItems, addToQueue, updateItem, updateStatus, clearItems,
    getAppSettings, saveAppSettings, openLink, getDefaultDownloadDir,
    handleImportFromFile, handleRetryItem, handleTriggerUpload,
    handleCancelItem, handleRestartEncoding, handleGetGalleryItems
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