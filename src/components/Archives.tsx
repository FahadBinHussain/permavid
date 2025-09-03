import { useState, useEffect } from "react";
import { QueueItem } from "@/lib/queue";
import { useTauri } from "@/app/tauri-integration";
import { QueueItem as TauriQueueItem } from "@/lib/tauri-api";

// Helper to convert from Tauri QueueItem to App QueueItem
function convertTauriItem(item: TauriQueueItem): QueueItem {
  return {
    id: item.id || "unknown-id", // Provide a default ID if undefined
    url: item.url,
    status: item.status as QueueItem["status"],
    title: item.title || null,
    message: item.message || null,
    local_path: item.local_path || null,
    info_json_path: null, // Not available in Tauri item
    filemoon_url: item.filemoon_url || null,

    encoding_progress: item.encoding_progress || null,
    thumbnail_url: item.thumbnail_url || null,
    added_at: item.added_at || Date.now(),
    updated_at: item.updated_at || Date.now(),
    user_id: item.user_id || null,
  };
}

export default function Archives() {
  const { getGalleryItems, isTauriEnvironment } = useTauri();
  const [archives, setArchives] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchArchives() {
      try {
        // Use different fetch methods based on environment
        if (isTauriEnvironment) {
          // We're in Tauri desktop app - use Tauri API
          console.log("Using Tauri API for archives");
          try {
            const result = await getGalleryItems();
            if (result.success && result.data) {
              // Convert from Tauri QueueItem type to App QueueItem type
              const convertedItems = result.data.map(convertTauriItem);
              setArchives(convertedItems);
            } else {
              setError(result.message || "Failed to fetch archives");
            }
          } catch (tauriErr) {
            console.error("Tauri API error:", tauriErr);
            setError(
              `Error fetching archives from Tauri API: ${String(tauriErr)}`,
            );
          }
        } else {
          // We're in web browser - use web API
          console.log("Using Web API for archives");
          try {
            const response = await fetch("/api/archives");

            // Check for HTML error response (common when Next.js returns 500)
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.includes("text/html")) {
              console.error(
                "Received HTML response instead of JSON - likely a server error",
              );
              setError("Server error occurred. Please try again later.");
              return;
            }

            const data = await response.json();

            if (data.success) {
              setArchives(data.archives);
            } else {
              setError(data.error || "Failed to fetch archives");
            }
          } catch (webErr) {
            console.error("Web API error:", webErr);
            if (webErr instanceof SyntaxError) {
              setError("Server returned invalid data. Please try again later.");
            } else {
              setError(`Error fetching archives: ${String(webErr)}`);
            }
          }
        }
      } catch (err) {
        console.error("General error fetching archives:", err);
        setError("Error fetching archives. Please try again later.");
      } finally {
        setLoading(false);
      }
    }

    fetchArchives();
  }, [isTauriEnvironment, getGalleryItems]);

  if (loading) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Video Archives</h2>
        <p>Loading archives...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Video Archives</h2>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (archives.length === 0) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Video Archives</h2>
        <p>No archives found.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Video Archives</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {archives.map((archive) => (
          <div key={archive.id} className="border rounded-lg p-4 shadow-sm">
            {archive.thumbnail_url && (
              <img
                src={archive.thumbnail_url}
                alt={archive.title || "Video thumbnail"}
                className="w-full h-32 object-cover mb-2 rounded"
              />
            )}
            <h3 className="font-semibold text-lg truncate">
              {archive.title || "Untitled"}
            </h3>
            <p className="text-sm text-gray-500 truncate">{archive.url}</p>
            <div className="mt-2 flex justify-between items-center">
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                {archive.status}
              </span>
              <a
                href={`/archive/${archive.id}`}
                className="text-blue-500 hover:underline text-sm"
              >
                View Details
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
