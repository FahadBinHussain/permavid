'use client'; // Required for useState and event handlers

import { useState, useEffect } from 'react';

// Define the structure for a queue item (matching backend)
interface QueueItem {
  id: string;
  url: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'uploading' | 'uploaded' | 'cancelled';
  message?: string;
  title?: string;
  filemoon_url?: string; // Add this to potentially display the filecode/link later
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false); // For adding URL
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]); // State for the queue
  const [isClearing, setIsClearing] = useState(false); // State for clearing buttons
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null); // Track which item is uploading
  const [cancellingItemId, setCancellingItemId] = useState<string | null>(null); // Track which item is cancelling

  // Function to fetch the queue status
  const fetchQueue = async () => {
    try {
      const response = await fetch('/api/queue');
      if (!response.ok) {
        throw new Error('Failed to fetch queue status');
      }
      const data: QueueItem[] = await response.json();
      setQueue(data);
    } catch (fetchError: any) {
      console.error('Error fetching queue:', fetchError);
      // Optionally set an error state for queue fetching
    }
  };

  // Fetch queue on initial load and then periodically
  useEffect(() => {
    fetchQueue(); // Initial fetch
    const intervalId = setInterval(fetchQueue, 2000); // Fetch every 2 seconds

    // Cleanup function to clear the interval when the component unmounts
    return () => clearInterval(intervalId);
  }, []); // Empty dependency array ensures this runs only once on mount

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      // Update message to indicate queuing
      setMessage(`Success: ${data.message}`);
      setUrl(''); // Clear the input field on success
      fetchQueue(); // Fetch queue immediately after adding
    } catch (submitError: any) {
      console.error('Submission error:', submitError);
      setError(`Failed to add URL: ${submitError.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- New function to handle clearing --- 
  const handleClearQueue = async (type: 'completed' | 'failed' | 'finished' | 'cancelled') => {
    setIsClearing(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/queue/clear?type=${type}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      setMessage(`Successfully cleared ${data.count} ${type} items.`);
      fetchQueue(); // Refresh queue view
    } catch (clearError: any) {
      console.error(`Error clearing ${type} items:`, clearError);
      setError(`Failed to clear queue: ${clearError.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  // --- New function to handle uploading --- 
  const handleUpload = async (itemId: string) => {
    setUploadingItemId(itemId); // Set loading state for this specific item
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/upload/${itemId}`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      setMessage(data.message || `Upload started/completed for item ${itemId}.`);
      fetchQueue(); // Refresh queue view to show 'uploading' then 'uploaded' status
    } catch (uploadError: any) {
      console.error(`Error uploading item ${itemId}:`, uploadError);
      setError(`Failed to upload item ${itemId}: ${uploadError.message}`);
      fetchQueue(); // Refresh queue view to potentially show failure status
    } finally {
      setUploadingItemId(null); // Clear loading state for this item
    }
  };

  // --- New function to handle cancelling ---
  const handleCancel = async (itemId: string) => {
    setCancellingItemId(itemId); // Set loading state for this specific item
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/cancel/${itemId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      setMessage(data.message || `Cancellation processed for item ${itemId}.`);
      fetchQueue(); // Refresh queue view
    } catch (cancelError: any) {
      console.error(`Error cancelling item ${itemId}:`, cancelError);
      setError(`Failed to cancel item ${itemId}: ${cancelError.message}`);
      fetchQueue(); // Refresh queue view
    } finally {
      setCancellingItemId(null); // Clear loading state for this item
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm flex flex-col">
        <h1 className="text-3xl md:text-4xl font-bold mb-8">PermaVid URL Adder & Queue</h1>

        {/* Submission Form */} 
        <form onSubmit={handleSubmit} className="w-full max-w-md mb-12">
          <div className="mb-4">
            <label htmlFor="urlInput" className="block text-sm font-medium text-gray-700 mb-1">
              Video URL:
            </label>
            <input
              id="urlInput"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black"
            />
          </div>
           <button
            type="submit"
            disabled={isLoading || !url}
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Adding...' : 'Add URL to Queue'}
          </button>
        </form>

        {/* Feedback Messages */} 
        {message && (
          <p className="mt-4 text-green-600 text-center mb-4">{message}</p>
        )}
        {error && (
          <p className="mt-4 text-red-600 text-center mb-4">{error}</p>
        )}

        {/* Queue Display */} 
        <div className="w-full max-w-4xl">
          <div className="flex justify-between items-center mb-4">
             <h2 className="text-2xl font-semibold">Download Queue ({queue.length} items)</h2>
             {/* --- Add Clear Buttons --- */} 
             <div className="space-x-2">
                <button 
                  onClick={() => handleClearQueue('completed')}
                  disabled={isClearing || !queue.some(item => item.status === 'completed')}
                  className="px-3 py-1 text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear Completed
                </button>
                <button 
                  onClick={() => handleClearQueue('failed')}
                  disabled={isClearing || !queue.some(item => item.status === 'failed')}
                  className="px-3 py-1 text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear Failed
                </button>
                 <button 
                  onClick={() => handleClearQueue('finished')}
                  disabled={isClearing || !queue.some(item => item.status === 'completed' || item.status === 'failed')}
                  className="px-3 py-1 text-xs font-medium rounded-md text-white bg-gray-500 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear Finished
                </button>
                {/* --- Add Clear Cancelled Button --- */}
                 <button 
                  onClick={() => handleClearQueue('cancelled')}
                  disabled={isClearing || !queue.some(item => item.status === 'cancelled')}
                  className="px-3 py-1 text-xs font-medium rounded-md text-white bg-gray-500 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear Cancelled
                </button>
             </div>
          </div>

          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul role="list" className="divide-y divide-gray-200">
              {queue.length === 0 && (
                <li className="px-4 py-4 text-center text-gray-500">
                  Queue is empty.
                </li>
              )}
              {queue.map((item) => (
                <li key={item.id} className="px-4 py-4 sm:px-6">
                  {/* Top Row: Title and Status Badge */}
                  <div className="flex items-center justify-between space-x-2">
                    {/* Make title take remaining space and truncate */}
                    <div className="text-sm font-medium text-indigo-600 truncate flex-1 min-w-0">
                      {item.title || item.url}
                    </div>
                    {/* Keep status badge fixed size */}
                    <div className="ml-2 flex-shrink-0 flex">
                      <p className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${ 
                        item.status === 'completed' ? 'bg-green-100 text-green-800' : 
                        item.status === 'failed' ? 'bg-red-100 text-red-800' : 
                        item.status === 'downloading' ? 'bg-yellow-100 text-yellow-800' : 
                        item.status === 'uploading' ? 'bg-blue-100 text-blue-800' :
                        item.status === 'uploaded' ? 'bg-purple-100 text-purple-800' :
                        item.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                        'bg-gray-100 text-gray-800' 
                      }`}>
                        {item.status}
                      </p>
                    </div>
                  </div>
                  {/* Bottom Row: URL/Message and Action Button */}
                  <div className="mt-2 sm:flex sm:justify-between sm:items-center">
                    {/* Info Section (URL/Message) - Allow shrinking and truncating */}
                    <div className="sm:flex-1 min-w-0 mr-4"> {/* Add min-w-0 here */}
                      <p className="flex items-center text-sm text-gray-500">
                        {/* Show URL if title is present, and truncate it */} 
                        {item.title && <span className="mr-2 truncate block">{item.url}</span>}
                        {/* Show message and truncate it */}
                        {(item.status === 'failed' || item.status === 'completed' || item.status === 'downloading' || item.status === 'uploading' || item.status === 'uploaded' || item.status === 'cancelled') && item.message && (
                            <span className="text-xs italic text-gray-400 truncate block">- {item.message}</span>
                        )}
                      </p>
                    </div>
                     {/* Action Button Section (Upload Button) - Keep fixed size */}
                     <div className="mt-2 sm:mt-0 flex-shrink-0"> {/* Ensure this part doesn't shrink */}
                         {item.status === 'completed' && (
                           <button 
                              onClick={() => handleUpload(item.id)}
                              disabled={uploadingItemId === item.id} // Disable button if this item is uploading
                              className="px-2 py-1 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {uploadingItemId === item.id ? 'Uploading...' : 'Upload'}
                            </button>
                         )}
                         {/* Placeholder for Cancel button to be added later */} 
                         {/* --- Add Cancel Button --- */}
                         {(item.status === 'queued' || item.status === 'downloading') && (
                           <button
                             onClick={() => handleCancel(item.id)}
                             disabled={cancellingItemId === item.id} // Disable button if this item is cancelling
                             className="ml-2 px-2 py-1 text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                           >
                             {cancellingItemId === item.id ? 'Cancelling...' : 'Cancel'}
                           </button>
                         )}
                     </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </main>
  );
}
