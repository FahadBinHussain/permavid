'use client';

import React, { useState, useEffect } from 'react';
import { isTauri, getVideos, addVideo, openExternalLink } from '@/lib/tauri';
import type { Video } from '@/lib/tauri';

export default function TauriTestPage() {
  const [isTauriEnv, setIsTauriEnv] = useState<boolean>(false);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [newVideo, setNewVideo] = useState<{ title: string; url: string }>({
    title: '',
    url: '',
  });

  useEffect(() => {
    // Check if we're running in Tauri
    setIsTauriEnv(isTauri());
    
    // Load videos
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      setLoading(true);
      const videosData = await getVideos();
      setVideos(videosData);
      setError(null);
    } catch (err) {
      console.error('Error fetching videos:', err);
      setError('Failed to load videos. ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleAddVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideo.title || !newVideo.url) {
      setError('Please enter both title and URL');
      return;
    }

    try {
      setLoading(true);
      await addVideo({
        title: newVideo.title,
        url: newVideo.url,
        status: 'pending',
      });
      
      // Reset form and refresh videos
      setNewVideo({ title: '', url: '' });
      await fetchVideos();
      setError(null);
    } catch (err) {
      console.error('Error adding video:', err);
      setError('Failed to add video. ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Tauri Integration Test</h1>
      
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <p className="text-lg">
          Environment: <span className="font-semibold">{isTauriEnv ? 'Tauri' : 'Browser/Electron'}</span>
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">Add New Video</h2>
        <form onSubmit={handleAddVideo} className="space-y-4">
          <div>
            <label htmlFor="title" className="block mb-1">Title</label>
            <input
              type="text"
              id="title"
              value={newVideo.title}
              onChange={(e) => setNewVideo({ ...newVideo, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Video title"
            />
          </div>
          <div>
            <label htmlFor="url" className="block mb-1">URL</label>
            <input
              type="url"
              id="url"
              value={newVideo.url}
              onChange={(e) => setNewVideo({ ...newVideo, url: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="https://example.com/video"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Adding...' : 'Add Video'}
          </button>
        </form>
      </div>

      <div>
        <h2 className="text-2xl font-semibold mb-4">Video List</h2>
        {loading && videos.length === 0 ? (
          <p>Loading videos...</p>
        ) : videos.length === 0 ? (
          <p>No videos found. Add your first video above.</p>
        ) : (
          <div className="space-y-4">
            {videos.map((video) => (
              <div key={video.id} className="p-4 border rounded-lg">
                <h3 className="text-xl font-medium">{video.title}</h3>
                <p className="mt-1 text-gray-600 truncate">{video.url}</p>
                <div className="mt-2 flex items-center">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    video.status === 'downloaded' ? 'bg-green-100 text-green-800' :
                    video.status === 'error' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {video.status}
                  </span>
                  <button
                    onClick={() => openExternalLink(video.url)}
                    className="ml-4 text-blue-600 hover:underline text-sm"
                  >
                    Open Link
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 