'use client'; // Required for useState and event handlers

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// Define the structure for a queue item (matching backend)
interface QueueItem {
  id: string;
  url: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'uploading' | 'uploaded' | 'transferring' | 'cancelled' | 'encoding' | 'encoded';
  message?: string;
  title?: string;
  filemoon_url?: string; // Stores the filecode
  encoding_progress?: number | null; // Add encoding progress field
  thumbnail_url?: string; // Add thumbnail URL
  updated_at?: number; // Ensure updated_at is here if needed by UI (e.g. for sorting, though not currently used)
}

// Define structure for settings
interface AppSettings {
    filemoon_api_key?: string;
    download_directory?: string;
    delete_after_upload?: string; // Store as string 'true'/'false'
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
  const [restartingItemId, setRestartingItemId] = useState<string | null>(null); // Track which item is restarting encoding

  // --- Settings State ---
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({});
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // --- UI State ---
  const [showClearDropdown, setShowClearDropdown] = useState(false);

  // --- Fetch Queue and Settings ---
  const fetchQueue = useCallback(async () => {
    try {
      const response = await fetch('/api/queue');
      if (!response.ok) throw new Error('Failed to fetch queue');
      const data: QueueItem[] = await response.json();
      setQueue(data);
    } catch (fetchError: any) {
      console.error('Error fetching queue:', fetchError);
      // Optionally set an error state for queue fetching
    }
  }, []); // Empty dependency array as fetchQueue itself doesn't depend on changing state

  const fetchSettings = useCallback(async () => {
    try {
        const response = await fetch('/api/settings');
        if (!response.ok) throw new Error('Failed to fetch settings');
        const data: AppSettings = await response.json();
        setSettings(data);
    } catch (fetchError: any) {
        console.error('Error fetching settings:', fetchError);
        setError('Failed to load application settings.');
    }
  }, []); // Also no dependencies

  // Fetch queue and settings on initial load and periodically for queue
  useEffect(() => {
    fetchQueue();
    fetchSettings();
    const intervalId = setInterval(fetchQueue, 2000); // Fetch queue every 2 seconds

    return () => clearInterval(intervalId);
  }, [fetchQueue, fetchSettings]); // Add fetch functions as dependencies

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

  // --- New function to handle restarting encoding ---
  const handleRestartEncoding = async (itemId: string) => {
    setRestartingItemId(itemId);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/restart-encoding/${itemId}`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      setMessage(data.message || `Restart encoding request sent for item ${itemId}.`);
      fetchQueue(); // Refresh queue to show status change (back to uploaded or similar)
    } catch (restartError: any) {
      console.error(`Error restarting encoding for item ${itemId}:`, restartError);
      setError(`Failed to restart encoding for item ${itemId}: ${restartError.message}`);
      fetchQueue(); // Refresh queue view anyway
    } finally {
      setRestartingItemId(null);
    }
  };

  // --- New function to handle saving settings ---
  const handleSaveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setMessage('');
    setError('');

    // Prepare the settings object to send
    const settingsToSave: AppSettings = {
        filemoon_api_key: settings.filemoon_api_key || '', // Send empty string if undefined
        download_directory: settings.download_directory || '',
        delete_after_upload: settings.delete_after_upload === 'true' ? 'true' : 'false' // Ensure boolean-like string
    };

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsToSave)
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! Status: ${response.status}`);
        }
        setSettings(data.settings); // Update local state with confirmed settings
        setMessage('Settings saved successfully.');
        setShowSettingsModal(false); // Close modal on success
    } catch (saveError: any) {
        console.error('Error saving settings:', saveError);
        setError(`Failed to save settings: ${saveError.message}`);
    } finally {
        setIsSavingSettings(false);
    }
  };

  // *** ADDED: Filter the queue for display ***
  const activeQueueItems = queue.filter(item => 
    item.status !== 'encoded' && 
    item.status !== 'failed' && 
    item.status !== 'cancelled'
  );

  // --- Settings Modal Component (Simplified Inline) ---
  const SettingsModal = () => (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex justify-center items-center z-50">
        <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-lg">
            <h2 className="text-2xl font-bold mb-6">Application Settings</h2>
            <form onSubmit={handleSaveSettings}>
                {/* Filemoon API Key */} 
                <div className="mb-4">
                    <label htmlFor="filemoonApiKey" className="block text-sm font-medium text-gray-700 mb-1">Filemoon API Key</label>
                    <input
                        id="filemoonApiKey"
                        type="text" 
                        value={settings.filemoon_api_key || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, filemoon_api_key: e.target.value }))}
                        placeholder="Enter your Filemoon API Key"
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black"
                    />
                </div>
                {/* Download Directory */} 
                <div className="mb-4">
                    <label htmlFor="downloadDir" className="block text-sm font-medium text-gray-700 mb-1">Download Directory</label>
                    <input
                        id="downloadDir"
                        type="text"
                        value={settings.download_directory || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, download_directory: e.target.value }))}
                        placeholder="e.g., C:\Users\You\Downloads\PermaVid"
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black"
                    />
                    {/* Basic validation hint - advanced validation later */}
                    <p className="mt-1 text-xs text-gray-500">Enter the full path for downloads.</p>
                </div>
                {/* Delete After Upload */} 
                <div className="mb-6 flex items-center">
                    <input
                        id="deleteAfterUpload"
                        type="checkbox"
                        checked={settings.delete_after_upload === 'true'}
                        onChange={(e) => setSettings(prev => ({ ...prev, delete_after_upload: e.target.checked ? 'true' : 'false' }))}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="deleteAfterUpload" className="ml-2 block text-sm text-gray-900">
                        Delete local file after successful upload
                    </label>
                </div>

                {/* Action Buttons */} 
                <div className="flex justify-end space-x-4">
                    <button
                        type="button"
                        onClick={() => setShowSettingsModal(false)}
                        disabled={isSavingSettings}
                        className="py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSavingSettings}
                        className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                        {isSavingSettings ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </form>
        </div>
    </div>
  );

  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-24">
      {/* --- Settings Modal Trigger --- */} 
       <button 
            onClick={() => setShowSettingsModal(true)}
            className="absolute top-4 right-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
        >
            Settings
        </button>
        {/* --- Link to Gallery Page --- */}
        <Link 
            href="/gallery" 
            className="absolute top-4 right-24 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
        >
            View Gallery
        </Link>

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
             {/* *** UPDATED: Use filtered list length for display *** */}
             <h2 className="text-2xl font-semibold">Download Queue ({activeQueueItems.length} items)</h2>
             {/* --- Consolidated Clear Button Dropdown --- */}
             <div className="relative">
                 <button
                     onClick={() => setShowClearDropdown(!showClearDropdown)}
                     disabled={isClearing}
                     className="px-3 py-1 text-xs font-medium rounded-md text-white bg-gray-500 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                 >
                     Clear...
                     <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                 </button>

                 {/* Dropdown Menu */} 
                 {showClearDropdown && (
                     <div 
                        className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
                        onMouseLeave={() => setShowClearDropdown(false)} // Close on mouse leave
                     >
                         <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                             <button
                                 onClick={() => { handleClearQueue('completed'); setShowClearDropdown(false); }}
                                 // *** NOTE: disabled check uses the FULL `queue` state ***
                                 disabled={!queue.some(item => item.status === 'completed')} // Keep using full queue
                                 className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                 role="menuitem"
                             >
                                 Clear Completed
                             </button>
                             <button
                                 onClick={() => { handleClearQueue('failed'); setShowClearDropdown(false); }}
                                 // *** NOTE: disabled check uses the FULL `queue` state ***
                                 disabled={!queue.some(item => item.status === 'failed' || item.status === 'uploading')} // Keep using full queue
                                 className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                 role="menuitem"
                             >
                                 Clear Failed/Uploading
                             </button>
                             <button
                                 onClick={() => { handleClearQueue('cancelled'); setShowClearDropdown(false); }}
                                 // *** NOTE: disabled check uses the FULL `queue` state ***
                                 disabled={!queue.some(item => item.status === 'cancelled')} // Keep using full queue
                                 className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                 role="menuitem"
                             >
                                 Clear Cancelled
                             </button>
                             <button
                                 onClick={() => { handleClearQueue('finished'); setShowClearDropdown(false); }}
                                 // *** NOTE: disabled check uses the FULL `queue` state ***
                                 disabled={!queue.some(item => item.status === 'completed' || item.status === 'failed')} // Keep using full queue
                                 className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                 role="menuitem"
                             >
                                 Clear All Finished
                             </button>
                         </div>
                     </div>
                 )}
             </div>
          </div>

          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul role="list" className="divide-y divide-gray-200">
              {/* *** UPDATED: Use filtered list for display checks and mapping *** */}
              {activeQueueItems.length === 0 && (
                <li className="px-4 py-4 text-center text-gray-500">
                  Queue is empty.
                </li>
              )}
              {activeQueueItems.map((item) => (
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
                        item.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                        item.status === 'transferring' ? 'bg-blue-100 text-blue-800' :
                        item.status === 'encoding' ? 'bg-cyan-100 text-cyan-800' :
                        item.status === 'encoded' ? 'bg-indigo-100 text-indigo-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {item.status}
                      </p>
                    </div>
                  </div>
                  {/* Bottom Row: URL/Message and Action Button */}
                  <div className="mt-2 sm:flex sm:justify-between sm:items-center">
                    {/* Info Section (URL/Message) - Allow shrinking and truncating */}
                    <div className="sm:flex-1 min-w-0 mr-4"> {/* Add min-w-0 here */}
                      {/* Display URL when title exists */}
                      {item.title && <p className="text-sm text-gray-500 truncate block">{item.url}</p>}

                      {/* Display Message or Progress */}
                      {item.status === 'downloading' && item.message?.startsWith('Downloading:') &&
                        <div className="flex items-center mt-1">
                          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mr-2">
                            <div 
                              className="bg-yellow-500 h-2.5 rounded-full"
                              style={{ width: `${item.message.match(/(\d+)%/)?.[1] ?? 0}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-yellow-700 whitespace-nowrap">
                            {item.message.match(/(\d+)%/)?.[0] ?? '0%'}
                          </span>
                        </div>
                      }
                      {/* Show standard message for other states or if download message is not progress */}
                      {(!(item.status === 'downloading' && item.message?.startsWith('Downloading:')) && item.message) && (
                         <p className="text-xs italic text-gray-400 truncate block mt-1">- {item.message}</p>
                      )}
                    </div>
                     {/* Action Button Section (Upload Button) - Keep fixed size */}
                     <div className="mt-2 sm:mt-0 flex-shrink-0 flex items-center"> {/* Use flex items-center here */} 
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
                         {/* Display Filemoon Link if available (uploaded, transferring, encoding, or encoded) */}
                         {(item.status === 'uploaded' || item.status === 'transferring' || item.status === 'encoding' || item.status === 'encoded') && item.filemoon_url && (
                           <a 
                             href={`https://filemoon.sx/d/${item.filemoon_url}`}
                             target="_blank" 
                             rel="noopener noreferrer"
                             className="ml-2 px-2 py-1 text-xs font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
                           >
                             View Link
                           </a>
                         )}
                         {/* --- Add Restart Encoding Button --- */} 
                         {item.status === 'failed' && item.filemoon_url && (
                           <button
                             onClick={() => handleRestartEncoding(item.id)}
                             disabled={restartingItemId === item.id}
                             className="ml-2 px-2 py-1 text-xs font-medium rounded-md text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                           >
                             {restartingItemId === item.id ? 'Restarting...' : 'Restart Encoding'}
                           </button>
                         )}
                         {/* Display Encoding Progress (if applicable) - Restore */}
                         {item.status === 'encoding' && (
                           <div className="ml-2 w-24 bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 flex items-center">
                             <div 
                               className="bg-cyan-600 h-2.5 rounded-full"
                               style={{ width: `${item.encoding_progress ?? 0}%` }}
                             >
                             </div>
                             <span className="ml-1 text-xs text-cyan-700">{`${item.encoding_progress ?? 0}%`}</span>
                           </div>
                         )}
                     </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>

       {/* --- Conditionally Render Settings Modal --- */}
      {showSettingsModal && <SettingsModal />}
    </main>
  );
}
