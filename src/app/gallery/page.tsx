'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link'; // For linking back

// Define the structure for a queue item (matching backend, including thumbnail)
interface GalleryItem {
  id: string;
  url: string; // Original URL
  status: 'encoded'; // Only encoded items here
  message?: string;
  title?: string;
  filemoon_url?: string; // Filecode used for link and thumbnail
  thumbnail_url?: string; // URL for the thumbnail image
  updated_at: number; // Used for sorting
}

export default function GalleryPage() {
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchGallery = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/gallery');
      if (!response.ok) {
        throw new Error('Failed to fetch gallery items');
      }
      const data: GalleryItem[] = await response.json();
      setGalleryItems(data);
    } catch (fetchError: any) {
      console.error('Error fetching gallery:', fetchError);
      setError('Failed to load gallery items.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGallery();
    // Optional: Add periodic refresh if desired
    // const intervalId = setInterval(fetchGallery, 30000); // Refresh every 30s
    // return () => clearInterval(intervalId);
  }, [fetchGallery]);

  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-16 bg-gray-50">
      <div className="w-full max-w-7xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800">Completed Videos</h1>
          <Link 
            href="/" 
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
           >
              &larr; Back to Queue
          </Link>
        </div>

        {/* Loading State */}
        {isLoading && <p className="text-center text-gray-500">Loading gallery...</p>}

        {/* Error State */}
        {error && <p className="mt-4 text-red-600 text-center mb-4">Error: {error}</p>}

        {/* Gallery Grid */}
        {!isLoading && !error && (
          galleryItems.length === 0 ? (
            <p className="text-center text-gray-500">No completed videos found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {galleryItems.map((item) => (
                <div key={item.id} className="bg-white rounded-lg shadow-md overflow-hidden transform transition duration-300 hover:scale-105">
                  <a href={`https://filemoon.to/d/${item.filemoon_url}`} target="_blank" rel="noopener noreferrer">
                    {item.thumbnail_url ? (
                      <img 
                        src={item.thumbnail_url}
                        alt={`Thumbnail for ${item.title || 'video'}`}
                        className="w-full h-40 object-cover" 
                        onError={(e) => { 
                          // Optional: Handle broken images 
                          (e.target as HTMLImageElement).src = '/placeholder-image.png'; // Need a placeholder
                          (e.target as HTMLImageElement).alt = 'Thumbnail not available';
                        }}
                      />
                    ) : (
                      // Placeholder if thumbnail is missing
                      <div className="w-full h-40 bg-gray-200 flex items-center justify-center">
                        <span className="text-gray-400 text-sm">No Thumbnail</span>
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="text-md font-semibold text-gray-800 truncate mb-1" title={item.title || item.url}>
                        {item.title || 'Untitled Video'}
                      </h3>
                      {/* <p className="text-xs text-gray-500 truncate mb-2" title={item.url}>{item.url}</p> */} 
                      <p className="text-xs text-gray-500">
                        Completed: {new Date(item.updated_at).toLocaleDateString()} {new Date(item.updated_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </a>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </main>
  );
} 