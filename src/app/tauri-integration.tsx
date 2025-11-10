"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useMemo,
  useCallback,
} from "react";
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
} from "@/lib/tauri-api";
import { createEmptySettings } from "@/lib/settings-helper";
import { fetch as tauriFetch, Body } from "@tauri-apps/api/http"; // Import Tauri fetch AND Body
import { listen } from "@tauri-apps/api/event"; // Import event listener

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
  retryItem: (id: string) => Promise<string>;
  triggerUpload: (id: string) => Promise<{ success: boolean; message: string }>;
  cancelItem: (id: string) => Promise<{ success: boolean; message: string }>;
  restartEncoding: (
    id: string,
  ) => Promise<{ success: boolean; message: string }>;
  contributeIdentifier: (
    url: string,
  ) => Promise<{ success: boolean; error?: string }>;
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
  retryItem: async () => "",
  triggerUpload: async () => ({
    success: false,
    message: "Provider not ready",
  }),
  cancelItem: async () => ({ success: false, message: "Provider not ready" }),
  restartEncoding: async () => ({
    success: false,
    message: "Provider not ready",
  }),
  contributeIdentifier: async () => ({
    success: false,
    error: "Provider not ready",
  }),
});

// --- PLACEHOLDER: Replace with your actual Vercel deployment URL ---
const PUBLIC_INDEX_SERVER_BASE_URL = "https://permavid.vercel.app/api";
// --- END PLACEHOLDER ---

// --- ADDED: API Client function to contribute identifier ---
async function contributeIdentifier(
  url: string,
): Promise<{ success: boolean; error?: string }> {
  if (
    !PUBLIC_INDEX_SERVER_BASE_URL ||
    PUBLIC_INDEX_SERVER_BASE_URL.includes("your-permavid-index")
  ) {
    console.warn(
      "Public index server URL is not configured. Skipping contribution.",
    );
    return { success: false, error: "Server URL not configured" };
  }

  const endpoint = `${PUBLIC_INDEX_SERVER_BASE_URL}/add`;
  console.log(
    `Attempting to contribute identifier for URL: ${url} to ${endpoint}`,
  );

  try {
    const response = await tauriFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: Body.json({ url }), // Use Body.json()
      timeout: 15000, // 15 second timeout
    });

    console.log("Contribution response status:", response.status);
    console.log("Contribution response data:", response.data);

    if (!response.ok) {
      // Try to parse error message from response data
      let errorMessage = `Server responded with status ${response.status}`;
      if (
        typeof response.data === "object" &&
        response.data !== null &&
        (response.data as any).message
      ) {
        errorMessage = (response.data as any).message;
      }
      console.error("Failed to contribute identifier:", errorMessage);
      return { success: false, error: errorMessage };
    }

    console.log(`Successfully contributed identifier for: ${url}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error calling contribute identifier endpoint:", error);
    return {
      success: false,
      error: error.message || "Network error or failed to fetch",
    };
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
    } catch (err: any) {
      // Handle Tauri connection errors gracefully
      const errorString = String(err);
      if (
        !errorString.includes("connection closed") &&
        !errorString.includes("not available") &&
        !errorString.includes("__TAURI_INVOKE__")
      ) {
        // Only log non-connection errors
        console.error("Error fetching queue items:", err);
      }
      // Set empty array on error to prevent UI issues
      setQueueItems([]);
    }
  }, []);

  const getAppSettings = useCallback(async (): Promise<AppSettings> => {
    try {
      console.log("Fetching application settings...");
      // Get current user from localStorage
      let userId = "local-user"; // fallback
      try {
        const savedUser = localStorage.getItem("auth_user");
        if (savedUser) {
          const userData = JSON.parse(savedUser);
          userId = userData.id;
        }
      } catch (error) {
        console.error("Error getting user for settings:", error);
      }
      const appSettings = await getSettings(userId);
      console.log("Settings received:", appSettings);
      return appSettings || createEmptySettings();
    } catch (err) {
      console.error("Error fetching settings:", err);
      return createEmptySettings();
    }
  }, []);

  const saveAppSettings = useCallback(async (newSettings: AppSettings) => {
    // Get current user from localStorage
    let userId = "local-user"; // fallback
    try {
      const savedUser = localStorage.getItem("auth_user");
      if (savedUser) {
        const userData = JSON.parse(savedUser);
        userId = userData.id;
      }
    } catch (error) {
      console.error("Error getting user for settings:", error);
    }
    await saveSettings(newSettings, userId);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const tauriAvailable = isTauri();
      setIsTauriEnvironment(tauriAvailable);

      try {
        // Initial data load
        await Promise.all([fetchQueueItems(), getAppSettings()]);
      } catch (err) {
        console.error("Error initializing Tauri integration:", err);
      } finally {
        setIsReady(true);
      }
    };

    initialize();
  }, [fetchQueueItems, getAppSettings]);

  // Set up event listeners
  useEffect(() => {
    if (!isTauriEnvironment) return;

    let unlistenFn: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        // Listen for download completion events
        unlistenFn = await listen<{
          id: string;
          title?: string;
          localPath?: string;
          thumbnailUrl?: string;
        }>("download_complete", (event) => {
          console.log("Received download_complete event:", event);

          // Immediately update the queue items to reflect the completed download
          setQueueItems((prevItems) =>
            prevItems.map((item) =>
              item.id === event.payload.id
                ? {
                    ...item,
                    status: "completed",
                    title: event.payload.title || item.title,
                    local_path: event.payload.localPath || item.local_path,
                    thumbnail_url:
                      event.payload.thumbnailUrl || item.thumbnail_url,
                    message: "Download complete",
                  }
                : item,
            ),
          );

          // Also fetch the latest queue data from the backend
          fetchQueueItems();
        });
      } catch (err) {
        console.error("Error setting up event listeners:", err);
      }
    };

    setupListeners();

    // Return cleanup function
    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [isTauriEnvironment, fetchQueueItems]);

  const addToQueue = useCallback(
    async (item: QueueItem) => {
      const id = await addQueueItem(item);
      await fetchQueueItems();
      return id;
    },
    [fetchQueueItems],
  );

  const updateItem = useCallback(
    async (item: QueueItem) => {
      await updateQueueItem(item);
      await fetchQueueItems();
    },
    [fetchQueueItems],
  );

  const updateStatus = useCallback(
    async (id: string, status: string, message?: string) => {
      await updateItemStatus(id, status, message);
      await fetchQueueItems();
    },
    [fetchQueueItems],
  );

  const clearItems = useCallback(
    async (statusTypes: string[]) => {
      console.log("[DEBUG] clearItems called with statusTypes:", statusTypes);

      try {
        await clearCompletedItems(statusTypes);
        console.log("[DEBUG] clearCompletedItems completed, fetching queue...");

        await fetchQueueItems();
        console.log("[DEBUG] Queue items refreshed");
      } catch (error) {
        console.error("[ERROR] clearItems failed:", error);
        throw error; // Re-throw so the calling code can handle it
      }
    },
    [fetchQueueItems],
  );

  const openLink = useCallback(async (url: string) => {
    await openExternalLink(url);
  }, []);

  const getDefaultDownloadDir = useCallback(async () => {
    if (isTauriEnvironment) {
      return await getDownloadDirectory();
    }
    return "";
  }, [isTauriEnvironment]);

  const handleImportFromFile = useCallback(
    async (path: string) => {
      try {
        await importFromFile(path);
        await fetchQueueItems();
        await getAppSettings();
      } catch (err) {
        console.error("Error importing data:", err);
      }
    },
    [fetchQueueItems, getAppSettings],
  );

  const handleRetryItem = useCallback(
    async (id: string) => {
      try {
        const message = await retryItem(id);
        await fetchQueueItems();
        return message;
      } catch (err) {
        // No need to log here, it's already logged in the retryItem function
        return String(err);
      }
    },
    [fetchQueueItems],
  );

  const handleTriggerUpload = useCallback(
    async (id: string) => {
      try {
        const result = await triggerUpload(id);
        await fetchQueueItems();
        return result;
      } catch (err) {
        // In case of any unexpected error not caught by triggerUpload
        // Don't log API key errors
        if (
          !(
            err instanceof Error &&
            err.message.includes("API key not configured")
          )
        ) {
          console.error(
            `Unexpected error in handleTriggerUpload for ${id}:`,
            err,
          );
        }
        return {
          success: false,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
    [fetchQueueItems],
  );

  const handleCancelItem = useCallback(
    async (id: string) => {
      const result = await cancelItem(id);
      await fetchQueueItems();
      return result;
    },
    [fetchQueueItems],
  );

  const handleRestartEncoding = useCallback(async (id: string) => {
    // Restart encoding functionality removed in simplified system
    return { success: false, message: "Restart encoding not available" };
  }, []);

  const memoizedContributeIdentifier = useCallback(
    async (url: string) => {
      if (!isTauriEnvironment)
        return { success: false, error: "Not in Tauri environment" };
      return contributeIdentifier(url);
    },
    [isTauriEnvironment],
  );

  const contextValue = useMemo(
    () => ({
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
      contributeIdentifier: memoizedContributeIdentifier,
    }),
    [
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
      handleImportFromFile,
      handleRetryItem,
      handleTriggerUpload,
      handleCancelItem,
      handleRestartEncoding,
      memoizedContributeIdentifier,
    ],
  );

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
