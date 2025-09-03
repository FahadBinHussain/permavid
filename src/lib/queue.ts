import { prisma, getCurrentUserId } from "./db";
import { v4 as uuidv4 } from "uuid";
import { ChildProcess } from "child_process";

// Track active download processes by item ID
const activeDownloads = new Map<string, ChildProcess>();

// --- Queue Item Type (Matches DB) ---
export interface QueueItem {
  id: string;
  url: string;
  status:
    | "queued"
    | "downloading"
    | "completed"
    | "failed"
    | "uploading"
    | "uploaded"
    | "cancelled"
    | "encoding"
    | "encoded"
    | "transferring";
  title?: string | null;
  message?: string | null;
  local_path?: string | null;
  info_json_path?: string | null;
  filemoon_url?: string | null; // Stores the filecode

  encoding_progress?: number | null;
  thumbnail_url?: string | null; // Store thumbnail URL
  added_at: number;
  updated_at: number;
  user_id?: string | null;
}

// Helper function to convert Prisma QueueItem to our interface
function convertPrismaQueueItem(item: any): QueueItem {
  return {
    id: item.id,
    url: item.url,
    status: item.status as QueueItem["status"],
    title: item.title,
    message: item.message,
    local_path: item.localPath,
    info_json_path: item.infoJsonPath,
    filemoon_url: item.filemoonUrl,

    encoding_progress: item.encodingProgress,
    thumbnail_url: item.thumbnailUrl,
    added_at: Number(item.addedAt),
    updated_at: Number(item.updatedAt),
    user_id: item.userId,
  };
}

// --- Queue Functions ---

/**
 * Adds a new item to the queue.
 * @param url The URL to add to the queue.
 * @returns Result object with success status, message, and item if successful.
 */
export async function addToQueue(
  url: string,
): Promise<{ success: boolean; message: string; item?: QueueItem }> {
  const now = Date.now();

  try {
    const userId = await getCurrentUserId();

    // Check if URL already exists in the queue globally
    const existingItem = await prisma.queueItem.findFirst({
      where: {
        url,
      },
    });

    if (existingItem) {
      return {
        success: false,
        message: `This URL already exists in the ${existingItem.status} state.`,
      };
    }

    // Insert the new item
    const newItem = await prisma.queueItem.create({
      data: {
        id: uuidv4(),
        url,
        status: "queued",
        addedAt: BigInt(now),
        updatedAt: BigInt(now),
        userId,
      },
    });

    return {
      success: true,
      message: "URL added to queue successfully.",
      item: convertPrismaQueueItem(newItem),
    };
  } catch (error) {
    console.error("Failed to add URL to queue:", error);
    return {
      success: false,
      message: `Failed to add URL: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Gets all items from the queue except encoded ones.
 * @returns Array of queue items.
 */
export async function getQueue(): Promise<QueueItem[]> {
  try {
    const items = await prisma.queueItem.findMany({
      where: {
        status: { not: "encoded" },
      },
      orderBy: {
        addedAt: "desc",
      },
    });

    return items.map(convertPrismaQueueItem);
  } catch (error) {
    console.error("Failed to fetch queue from DB:", error);
    return []; // Return empty array on error
  }
}

/**
 * Gets the next queued item for processing.
 * @returns The next queued item or undefined if none.
 */
export async function getNextQueuedItem(): Promise<QueueItem | undefined> {
  try {
    const item = await prisma.queueItem.findFirst({
      where: {
        status: "queued",
      },
      orderBy: {
        addedAt: "asc",
      },
    });

    return item ? convertPrismaQueueItem(item) : undefined;
  } catch (error) {
    console.error("Failed to get next queued item:", error);
    return undefined;
  }
}

/**
 * Updates the status of a queue item.
 * @param itemId The ID of the item to update.
 * @param status The new status.
 * @param message Optional message to set.
 * @param title Optional title to update.
 * @param localPath Optional local path to update.
 * @param infoJsonPath Optional info JSON path to update.
 * @returns Result object with success status and message.
 */
export async function updateItemStatus(
  itemId: string,
  status: QueueItem["status"],
  message?: string | null,
  title?: string | null,
  localPath?: string | null,
  infoJsonPath?: string | null,
): Promise<{ success: boolean; message: string }> {
  const now = Date.now();

  try {
    await prisma.queueItem.update({
      where: {
        id: itemId,
      },
      data: {
        status,
        message,
        title,
        localPath,
        infoJsonPath,
        updatedAt: BigInt(now),
      },
    });

    return {
      success: true,
      message: `Status updated to ${status} for item ${itemId}.`,
    };
  } catch (error) {
    console.error(`Failed to update status for item ${itemId}:`, error);
    return {
      success: false,
      message: `Database error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Marks an item as downloading.
 * @param itemId The ID of the item to mark as downloading.
 * @param message Optional message to set.
 * @returns Result object with success status and message.
 */
export async function markDownloading(
  itemId: string,
  message?: string | null,
): Promise<{ success: boolean; message: string }> {
  const now = Date.now();

  try {
    await prisma.queueItem.update({
      where: {
        id: itemId,
      },
      data: {
        status: "downloading",
        message,
        updatedAt: BigInt(now),
      },
    });

    return {
      success: true,
      message: `Item ${itemId} marked as downloading.`,
    };
  } catch (error) {
    console.error(`Failed to mark item ${itemId} as downloading:`, error);
    return {
      success: false,
      message: `Database error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Updates the download progress of an item.
 * @param itemId The ID of the item to update.
 * @param message The progress message.
 * @returns Result object with success status and message.
 */
export async function updateDownloadProgress(
  itemId: string,
  message: string,
): Promise<{ success: boolean; message: string }> {
  const now = Date.now();

  try {
    await prisma.queueItem.update({
      where: {
        id: itemId,
      },
      data: {
        message,
        updatedAt: BigInt(now),
      },
    });

    return {
      success: true,
      message: `Progress updated for item ${itemId}.`,
    };
  } catch (error) {
    console.error(`Failed to update progress for item ${itemId}:`, error);
    return {
      success: false,
      message: `Database error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Gets an item by its ID.
 * @param itemId The ID of the item to get.
 * @returns The item or undefined if not found.
 */
export async function getItemById(
  itemId: string,
): Promise<QueueItem | undefined> {
  try {
    const item = await prisma.queueItem.findUnique({
      where: {
        id: itemId,
      },
    });
    return item ? convertPrismaQueueItem(item) : undefined;
  } catch (error) {
    console.error(`Failed to get item ${itemId}:`, error);
    return undefined;
  }
}

/**
 * Deletes an item by its ID.
 * @param itemId The ID of the item to delete.
 * @returns Result object with success status and message.
 */
export async function deleteItemById(
  itemId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await prisma.queueItem.delete({
      where: {
        id: itemId,
      },
    });

    return {
      success: !!result,
      message: result ? `Item ${itemId} deleted.` : `Item ${itemId} not found.`,
    };
  } catch (error) {
    console.error(`Failed to delete item ${itemId}:`, error);
    return {
      success: false,
      message: `Database error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Clears completed items from the queue.
 * @returns Result object with success status, count of cleared items, and message.
 */
export async function clearCompleted(): Promise<{
  success: boolean;
  count: number;
  message: string;
}> {
  try {
    const result = await prisma.queueItem.deleteMany({
      where: {
        status: "completed",
      },
    });

    const count = result.count;

    return {
      success: true,
      count,
      message: `Cleared ${count} completed items.`,
    };
  } catch (error) {
    console.error("Failed to clear completed items:", error);
    return {
      success: false,
      count: 0,
      message: `Database error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Clears failed items from the queue.
 * @returns Result object with success status, count of cleared items, and message.
 */
export async function clearFailed(): Promise<{
  success: boolean;
  count: number;
  message: string;
}> {
  try {
    const result = await prisma.queueItem.deleteMany({
      where: {
        status: { in: ["failed", "uploading"] },
      },
    });

    const count = result.count;

    return {
      success: true,
      count,
      message: `Cleared ${count} failed/uploading items.`,
    };
  } catch (error) {
    console.error("Failed to clear failed/uploading items:", error);
    return {
      success: false,
      count: 0,
      message: `Database error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Clears cancelled items from the queue.
 * @returns Result object with success status, count of cleared items, and message.
 */
export async function clearCancelled(): Promise<{
  success: boolean;
  count: number;
  message: string;
}> {
  try {
    const result = await prisma.queueItem.deleteMany({
      where: {
        status: "cancelled",
      },
    });

    const count = result.count;

    return {
      success: true,
      count,
      message: `Cleared ${count} cancelled items.`,
    };
  } catch (error) {
    console.error("Failed to clear cancelled items:", error);
    return {
      success: false,
      count: 0,
      message: `Database error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Clears items by status types.
 * @param statusTypes Array of status types to clear.
 * @returns Result object with success status, count of cleared items, and message.
 */
export async function clearItemsByStatus(
  statusTypes: string[],
): Promise<{ success: boolean; count: number; message: string }> {
  if (statusTypes.length === 0) {
    return { success: true, count: 0, message: "No status types specified." };
  }

  try {
    const result = await prisma.queueItem.deleteMany({
      where: {
        status: { in: statusTypes },
      },
    });

    const count = result.count;

    return {
      success: true,
      count,
      message: `Cleared ${count} items with status types: ${statusTypes.join(", ")}.`,
    };
  } catch (error) {
    console.error(
      `Failed to clear items with status types ${statusTypes.join(", ")}:`,
      error,
    );
    return {
      success: false,
      count: 0,
      message: `Database error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Gets only the successfully encoded items for the gallery.
 * @returns Array of encoded queue items.
 */
export async function getEncodedItems(): Promise<QueueItem[]> {
  try {
    const items = await prisma.queueItem.findMany({
      where: {
        status: "encoded",
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
    return items.map(convertPrismaQueueItem);
  } catch (error) {
    console.error("Failed to fetch encoded items from DB:", error);
    return []; // Return empty array on error
  }
}

/**
 * Cancels an item in the queue.
 * @param itemId The ID of the item to cancel.
 * @returns Result object with success status and message.
 */
export async function cancelItem(
  itemId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    // Get the current item
    const item = await getItemById(itemId);

    if (!item) {
      return {
        success: false,
        message: `Cancel failed: Item with ID ${itemId} not found.`,
      };
    }

    const currentStatus = item.status;

    if (currentStatus === "queued") {
      // For queued items, just delete them
      return await deleteItemById(itemId);
    } else if (
      currentStatus === "downloading" ||
      currentStatus === "uploading"
    ) {
      // For downloading or uploading items, terminate the process if possible
      if (currentStatus === "downloading") {
        const process = activeDownloads.get(itemId);
        if (process) {
          try {
            process.kill("SIGKILL");
            console.log(`Sent SIGKILL to process for item ${itemId}`);
          } catch (error) {
            console.error(`Failed to kill process for ${itemId}:`, error);
          }
          activeDownloads.delete(itemId);
        }
      }

      // Update the status to cancelled
      const message =
        currentStatus === "downloading"
          ? "Cancelled by user during download."
          : "Cancelled by user during upload.";

      return await updateItemStatus(
        itemId,
        "cancelled",
        message,
        item.title,
        item.local_path,
        item.info_json_path,
      );
    } else {
      // Cannot cancel items in other states
      return {
        success: false,
        message: `Cannot cancel item in '${currentStatus}' state.`,
      };
    }
  } catch (error) {
    console.error(`Failed to cancel item ${itemId}:`, error);
    return {
      success: false,
      message: `Database error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
