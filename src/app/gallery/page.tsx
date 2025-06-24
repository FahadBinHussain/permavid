'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useTauri } from '@/app/tauri-integration';
import { QueueItem } from '@/lib/tauri-api';

// Helper function to open links (similar to the one in Home page)
async function openGalleryLink(url: string | null | undefined) {
  if (!url) return;
  
  let targetUrl;
  if (url.startsWith('https://')) {
    targetUrl = url;
  } else if (url.startsWith('files_vc:')) {
    const code = url.replace('files_vc:', '');
    targetUrl = `https://files.vc/d/${code}`;
  } else {
    // Assume it's a Filemoon filecode
    targetUrl = `https://filemoon.sx/d/${url}`;
  }

  if (window.__TAURI__) {
    try {
      const { open } = await import('@tauri-apps/api/shell');
      await open(targetUrl);
    } catch (err) {
      console.error('Error opening link via Tauri:', err);
      window.open(targetUrl, '_blank'); // Fallback
    }
  } else {
    console.warn('Tauri API not found, opening link directly.');
    window.open(targetUrl, '_blank');
  }
}

// Gallery Item Component (Simplified)
interface GalleryListItemProps {
  item: QueueItem;
}

const GalleryListItem: React.FC<GalleryListItemProps> = ({ item }) => {
  return (
    <li className="px-4 py-4 sm:px-6">
      <div className="flex items-center justify-between space-x-4">
        <div className="flex-1 min-w-0">
          <div className="text-base font-semibold text-indigo-700 truncate" title={item.title || item.url}>
            {item.title || item.url}
          </div>
          <p className="text-sm text-gray-500 truncate block mt-1">
            {item.url} 
          </p>
          <p className="text-xs italic text-gray-400 truncate block mt-1">
             Encoded: {item.updated_at ? new Date(item.updated_at).toLocaleString() : 'N/A'}
          </p>
        </div>
        <div className="flex-shrink-0 flex items-center space-x-2">
          {item.filemoon_url && (
            <button
              onClick={() => openGalleryLink(item.filemoon_url)}
              className="px-2 py-1 text-xs font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
            >
              View Filemoon Link
            </button>
          )}
          {item.files_vc_url && (
             <button 
               onClick={() => openGalleryLink(item.files_vc_url)} 
               className="px-2 py-1 text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700" 
             > 
                View Files.vc Link 
             </button> 
           )} 
        </div>
      </div>
    </li>
  );
};

export default function GalleryPage() {
  const { getGalleryItems } = useTauri();
  const [galleryItems, setGalleryItems] = useState<QueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getGalleryItems();
      if (result.success && result.data) {
        setGalleryItems(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch gallery items.');
      }
    } catch (err: any) {
      console.error("Error fetching gallery items:", err);
      setError(err.message || 'An unknown error occurred while fetching gallery items.');
    } finally {
      setIsLoading(false);
    }
  }, [getGalleryItems]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-24">
      <Link href="/" className="absolute top-4 left-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm">
        &larr; Back to Queue
      </Link>
      
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm flex flex-col">
        <h1 className="text-3xl md:text-4xl font-bold mb-8">Video Archive</h1>

        {error && (
          <p className="mt-4 text-red-600 text-center mb-4">Error: {error}</p>
        )}

        <div className="w-full max-w-4xl">
          <h2 className="text-2xl font-semibold mb-4">All Archived Videos ({galleryItems.length})</h2>

          <div className="bg-white shadow overflow-hidden sm:rounded-md mt-4">
            <ul role="list" className="divide-y divide-gray-200">
              {isLoading ? (
                <li className="px-4 py-4 sm:px-6 text-center text-gray-500">
                  Loading archived videos...
                </li>
              ) : galleryItems.length === 0 ? (
                <li className="px-4 py-4 sm:px-6 text-center text-gray-500">
                  No encoded videos found in the archive yet.
                </li>
              ) : (
                galleryItems.map((item) => (
                  <GalleryListItem key={item.id ?? item.url} item={item} />
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
} 