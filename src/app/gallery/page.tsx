'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// Use the basic QueueItem structure, as API now returns this directly
import { QueueItem } from '@/lib/queue';

// Removed VideoModal component

// --- Gallery Page Component (Simplified) ---
export default function GalleryPage() {
  const [galleryItems, setGalleryItems] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Removed modal state

  const fetchGallery = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/gallery');
      if (!response.ok) {
        throw new Error(`Failed to fetch gallery items: ${response.statusText}`);
      }
      const data: QueueItem[] = await response.json(); // Expecting QueueItem[] now
      setGalleryItems(data);
    } catch (fetchError: any) {
      console.error('Error fetching gallery:', fetchError);
      setError(fetchError.message || 'Could not load gallery.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  // Removed modal handlers

  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-16 bg-gray-100">
      <div className="z-10 w-full max-w-7xl items-center justify-between font-mono text-sm flex flex-col">
        {/* Header and Back Link */}
        <div className="w-full flex justify-between items-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800">Archived Videos</h1>
          <Link href="/" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm">
              &larr; Back to Queue
          </Link>
        </div>

        {/* Loading State */}
        {isLoading && <p className="text-gray-600">Loading archived videos...</p>}

        {/* Error State */}
        {error && <p className="text-red-600 bg-red-100 p-4 rounded-md">Error: {error}</p>}

        {/* Gallery List/Grid */}
        {!isLoading && !error && (
          <div className="w-full bg-white shadow overflow-hidden sm:rounded-md">
             <ul role="list" className="divide-y divide-gray-200">
              {galleryItems.length === 0 ? (
                 <li className="px-4 py-4 sm:px-6 text-center text-gray-500">
                    No archived videos found.
                 </li>
              ) : (
                galleryItems.map((item) => (
                  <li key={item.id} className="px-4 py-4 sm:px-6 flex items-center justify-between space-x-4">
                    {/* Info Section */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate" title={item.title || item.url}>
                        {item.title || item.url}
                      </p>
                      <p className="text-sm text-gray-500">
                        Archived: {new Date(item.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    {/* Action Button: Direct Link */}
                    <div className="flex-shrink-0">
                      {item.filemoon_url ? (
                        <a 
                          href={`https://filemoon.sx/d/${item.filemoon_url}`} // Use fallback domain directly here too for simplicity
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="px-3 py-1 text-xs font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
                          title="View on Filemoon"
                        >
                          View Link
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">Link unavailable</span>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>
      {/* Removed Modal */}
    </main>
  );
} 