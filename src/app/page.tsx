'use client'; // Required for useState and event handlers

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import React from 'react';
import { getSettingsDirectly, createEmptySettings } from '@/lib/settings-helper';

// --- Add SVG Icons ---
const icons: { [key: string]: React.JSX.Element } = {
  queued: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  downloading: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 inline-block animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  completed: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 inline-block" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  ),
  uploading: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
    </svg>
  ),
  transferring: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
       <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /> // Reuse upload icon
    </svg>
  ),
  encoding: (
     <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 inline-block animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
     </svg>
  ),
  encoded: (
     <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 inline-block" viewBox="0 0 20 20" fill="currentColor">
       <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
       <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" /> // Film/Video icon
     </svg>
  ),
  failed: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 inline-block" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-10.707a1 1 0 00-1.414-1.414L10 8.586 7.707 6.293a1 1 0 00-1.414 1.414L8.586 10l-2.293 2.293a1 1 0 101.414 1.414L10 11.414l2.293 2.293a1 1 0 001.414-1.414L11.414 10l2.293-2.293z" clipRule="evenodd" />
    </svg>
  ),
  cancelled: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
  all: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
       <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  ),
};

// Define the structure for a queue item (matching backend)
interface QueueItem {
  id: string;
  url: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'uploading' | 'uploaded' | 'transferring' | 'cancelled' | 'encoding' | 'encoded';
  message?: string;
  title?: string;
  filemoon_url?: string; // Stores the filecode
  files_vc_url?: string; // Stores the Files.vc URL
  encoding_progress?: number | null; // Add encoding progress field
  thumbnail_url?: string; // Add thumbnail URL
  added_at?: number; // Make sure added_at is available for sorting
  updated_at?: number; // Ensure updated_at is here if needed by UI (e.g. for sorting, though not currently used)
}

// Define structure for settings
interface AppSettings {
    filemoon_api_key?: string;
    files_vc_api_key?: string; // Add Files.vc API key
    download_directory?: string;
    delete_after_upload?: string; // Store as string 'true'/'false'
    auto_upload?: string; // Store as string 'true'/'false'
    upload_target?: 'filemoon' | 'files_vc' | 'both' | string; // Add string type to make it compatible
}

// --- Add TypeScript definition for the exposed Electron API --- 
declare global {
    interface Window {
        electronAPI?: {
            openExternalLink: (url: string) => Promise<{ success: boolean; error?: string }>;
        };
    }
}

// --- Helper Component for Queue Item --- 
interface QueueItemProps {
  item: QueueItem;
  uploadingItemId: string | null;
  cancellingItemId: string | null;
  restartingItemId: string | null;
  retryingItemId: string | null;
  onUpload: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRestartEncoding: (id: string) => void;
  onOpenLink: (filecode: string | null | undefined) => void;
}

const QueueListItem: React.FC<QueueItemProps> = ({ 
  item, 
  uploadingItemId, 
  cancellingItemId, 
  restartingItemId, 
  retryingItemId, 
  onUpload,
  onCancel,
  onRetry,
  onRestartEncoding,
  onOpenLink
}) => {
  return (
    <li key={item.id} className="px-4 py-5 sm:px-6"> {/* Increased py */}
      <div className="flex items-start space-x-4"> {/* Use items-start for alignment with thumbnail */} 
          {/* Thumbnail (Optional) */}
          {item.thumbnail_url && (
            <div className="flex-shrink-0">
              <img 
                className="h-12 w-20 rounded object-cover" // Adjust size as needed
                src={item.thumbnail_url} 
                alt="Video thumbnail"
                onError={(e) => { e.currentTarget.style.display = 'none'; }} // Hide on error
              />
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex-1 min-w-0"> 
              {/* Top Row: Title and Status Badge */}
              <div className="flex items-center justify-between space-x-2 mb-1"> {/* Added mb-1 */} 
                {/* Make title take remaining space and truncate */}
                <div className="text-base font-semibold text-indigo-700 truncate flex-1 min-w-0" title={item.title || item.url}> {/* Increased size/weight, changed color */} 
                  {item.title || item.url}
                </div>
                {/* Keep status badge fixed size */} 
                <div className="ml-2 flex-shrink-0 flex">
                  <p className={`px-2 py-0.5 inline-flex items-center text-xs leading-5 font-semibold rounded-full ${ // Added py-0.5 and items-center
                    item.status === 'completed' ? 'bg-green-100 text-green-800' : 
                    item.status === 'failed' ? 'bg-red-100 text-red-800' : 
                    item.status === 'downloading' ? 'bg-yellow-100 text-yellow-800' : 
                    item.status === 'uploading' ? 'bg-blue-100 text-blue-800' :
                    item.status === 'cancelled' ? 'bg-gray-100 text-gray-800' :
                    item.status === 'transferring' ? 'bg-blue-100 text-blue-800' : // Keep color for transferring
                    item.status === 'encoding' ? 'bg-cyan-100 text-cyan-800' :
                    item.status === 'encoded' ? 'bg-indigo-100 text-indigo-800' : // More distinct color for encoded
                    'bg-purple-100 text-purple-800' // Default for queued
                  }`}> 
                    {icons[item.status] || null} {/* Add icon here */} 
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
                 {/* Action Button Section - Keep fixed size */} 
                 <div className="mt-2 sm:mt-0 flex-shrink-0 flex items-center space-x-2"> {/* Added space-x-2 */} 
                     {/* --- Add Cancel Button --- */} 
                     {(item.status === 'queued' || item.status === 'downloading') && ( 
                       <button 
                         onClick={() => onCancel(item.id)} 
                         disabled={cancellingItemId === item.id} // Disable button if this item is cancelling 
                         className="px-2 py-1 text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed" 
                       > 
                         {cancellingItemId === item.id ? 'Cancelling...' : 'Cancel'} 
                       </button> 
                     )} 
                     {/* --- ADDED: Add Upload Button for 'completed' items --- */} 
                     {item.status === 'completed' && ( 
                       <button 
                         onClick={() => onUpload(item.id)} 
                         disabled={uploadingItemId === item.id} // Disable if this specific item is uploading 
                         className="px-2 py-1 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed" 
                       > 
                         {uploadingItemId === item.id ? 'Uploading...' : 'Upload'} 
                       </button> 
                     )} 
                     {/* Display Filemoon Link if available (uploaded, transferring, encoding, or encoded) */} 
                     {(item.status === 'uploaded' || item.status === 'transferring' || item.status === 'encoding' || item.status === 'encoded') && item.filemoon_url && ( 
                       <button 
                         onClick={() => onOpenLink(item.filemoon_url)} 
                         className="px-2 py-1 text-xs font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700" 
                       > 
                          View Link 
                       </button> 
                     )} 
                     {/* Display Files.vc Link if available (uploaded, transferring, encoding, or encoded) */} 
                     {(item.status === 'uploaded' || item.status === 'transferring' || item.status === 'encoding' || item.status === 'encoded') && item.files_vc_url && ( 
                       <button 
                         onClick={() => onOpenLink(item.files_vc_url)} 
                         className="px-2 py-1 text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700" 
                       > 
                          View Link 
                       </button> 
                     )} 
                     {/* --- Add General Retry Button --- */} 
                     {item.status === 'failed' && !item.filemoon_url && ( // Only show if failed *before* upload 
                       <button 
                         onClick={() => onRetry(item.id)} 
                         disabled={retryingItemId === item.id} 
                         className="px-2 py-1 text-xs font-medium rounded-md text-white bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed" 
                       > 
                         {retryingItemId === item.id ? 'Retrying...' : 'Retry'} 
                       </button> 
                     )} 
                     {/* --- Add Restart Encoding Button --- */} 
                     {item.status === 'failed' && item.filemoon_url && ( // Only show restart if it failed *after* upload (has filemoon_url) 
                       <button 
                         onClick={() => onRestartEncoding(item.id)} 
                         disabled={restartingItemId === item.id} 
                         className="px-2 py-1 text-xs font-medium rounded-md text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed" 
                       > 
                         {restartingItemId === item.id ? 'Restarting...' : 'Restart Encoding'} 
                       </button> 
                     )} 
                     {/* Display Encoding Progress (if applicable) - Restore */} 
                     {item.status === 'encoding' && ( 
                       <div className="w-24 bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 flex items-center"> {/* Removed ml-2 */} 
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
          </div>
      </div>
    </li>
  );
};

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
  const [retryingItemId, setRetryingItemId] = useState<string | null>(null); // Track which item is retrying failed download/upload

  // --- Settings State ---
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({});
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // --- UI State ---
  const [showClearDropdown, setShowClearDropdown] = useState(false);
  // --- Filtering and Sorting State ---
  type FilterStatus = QueueItem['status'] | 'all';
  type SortKey = 'added_at_desc' | 'added_at_asc' | 'title_asc' | 'title_desc' | 'status';
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('added_at_desc');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // --- Fetch Queue and Settings ---
  const fetchQueue = useCallback(async () => {
    try {
      console.log('Attempting to fetch queue...');
      
      // Add a timeout to the fetch request to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout
      
      try {
        const response = await fetch('/api/queue', { 
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        clearTimeout(timeoutId); // Clear the timeout if request completes
        
        console.log('Queue fetch response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'No error details available');
          console.error(`API error response (${response.status}):`, errorText);
          throw new Error(`Failed to fetch queue: Server responded with ${response.status}`);
        }
        
        // Parse the JSON safely
        let data: QueueItem[];
        try {
          data = await response.json();
        } catch (jsonError) {
          console.error('Failed to parse queue JSON response:', jsonError);
          throw new Error('Invalid response format from queue API');
        }
        
        console.log(`Successfully fetched queue with ${data.length} items`);
        setQueue(data);
      } finally {
        clearTimeout(timeoutId); // Ensure timeout is cleared even if an error occurs
      }
    } catch (fetchError: any) {
      // More detailed error logging
      console.error('Error fetching queue:', fetchError);
      
      // Check for specific error types
      if (fetchError.name === 'AbortError') {
        console.error('Queue fetch request timed out after 10 seconds');
      } else if (fetchError instanceof TypeError && fetchError.message.includes('Failed to fetch')) {
        console.error('Network error when fetching queue - API might be unavailable');
      }
      
      // We don't set an error state here to avoid UI disruption during periodic fetching
      // But we could add an optional queue fetch status indicator if needed
    }
  }, []); // Empty dependency array as fetchQueue itself doesn't depend on changing state

  const fetchSettings = useCallback(async () => {
    try {
      console.log('Home: Fetching settings via direct helper...');
      
      // Use our robust direct settings fetcher instead of the API
      const data = await getSettingsDirectly();
      console.log('Home: Settings received via direct helper:', data);
      
      // Ensure we always have a valid settings object
      setSettings(data || createEmptySettings());
    } catch (fetchError: any) {
      console.error('Error fetching settings (with stack):', fetchError);
      setError('Failed to load application settings.');
      // Set empty settings as fallback
      setSettings(createEmptySettings());
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

  // --- New function to handle general retry for failed items --- 
  const handleRetry = async (itemId: string) => {
    setRetryingItemId(itemId);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/retry/${itemId}`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      setMessage(data.message || `Retry request sent for item ${itemId}.`);
      fetchQueue(); // Refresh queue to show status change (back to queued)
    } catch (retryError: any) {
      console.error(`Error retrying item ${itemId}:`, retryError);
      setError(`Failed to retry item ${itemId}: ${retryError.message}`);
      fetchQueue(); // Refresh queue view anyway
    } finally {
      setRetryingItemId(null);
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
        files_vc_api_key: settings.files_vc_api_key || '', // Send empty string if undefined
        download_directory: settings.download_directory || '',
        delete_after_upload: settings.delete_after_upload === 'true' ? 'true' : 'false', // Ensure boolean-like string
        auto_upload: settings.auto_upload === 'true' ? 'true' : 'false', // Ensure boolean-like string
        upload_target: settings.upload_target || 'filemoon' // Default to Filemoon if not set
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

  // --- New function to handle opening links externally via Electron --- 
  const handleOpenLink = async (filecode: string | null | undefined) => {
    console.log('handleOpenLink called with filecode:', filecode);
    if (!filecode) return;
    
    // Determine if it's a Files.vc link or Filemoon link based on format/prefix
    let url;
    if (filecode.startsWith('https://')) {
      // If it's a full URL already, use it directly (future-proofing)
      url = filecode;
    } else if (filecode.startsWith('files_vc:')) {
      // Handle Files.vc specific format if needed
      const code = filecode.replace('files_vc:', '');
      url = `https://files.vc/d/${code}`;
    } else {
      // Default to Filemoon if no specific format is detected
      url = `https://filemoon.sx/d/${filecode}`;
    }
    
    if (window.electronAPI) {
      console.log(`Attempting to open link via Electron: ${url}`);
      try {
        const result = await window.electronAPI.openExternalLink(url);
        if (!result.success) {
          console.error('Failed to open link via Electron:', result.error);
          setError('Could not open link in external browser.');
        }
      } catch (err) {
          console.error('Error calling electronAPI.openExternalLink:', err);
          setError('Error interacting with Electron to open link.');
      }
    } else {
      // Fallback for non-Electron environments (optional, unlikely for this app)
      console.warn('Electron API not found, opening link directly (may open in app window).');
      window.open(url, '_blank');
    }
  };

  // *** ADDED: Filter and Sort the queue for display ***
  const displayedQueueItems = queue
    .filter(item => {
      if (filterStatus === 'all') return true;
      return item.status === filterStatus;
    })
    .sort((a, b) => {
      switch (sortKey) {
        case 'added_at_asc':
          return (a.added_at || 0) - (b.added_at || 0);
        case 'added_at_desc':
          return (b.added_at || 0) - (a.added_at || 0);
        case 'title_asc':
          return (a.title || a.url || '').localeCompare(b.title || b.url || '');
        case 'title_desc':
          return (b.title || b.url || '').localeCompare(a.title || a.url || '');
        case 'status':
          return (a.status || '').localeCompare(b.status || '');
        default:
          return 0; // Should not happen
      }
    });

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
                {/* Files.vc API Key */} 
                <div className="mb-4">
                    <label htmlFor="filesVcApiKey" className="block text-sm font-medium text-gray-700 mb-1">Files.vc API Key</label>
                    <input
                        id="filesVcApiKey"
                        type="text" 
                        value={settings.files_vc_api_key || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, files_vc_api_key: e.target.value }))}
                        placeholder="Enter your Files.vc API Key"
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
                {/* Auto Upload */} 
                <div className="mb-6 flex items-center">
                    <input
                        id="autoUpload"
                        type="checkbox"
                        checked={settings.auto_upload === 'true'}
                        onChange={(e) => setSettings(prev => ({ ...prev, auto_upload: e.target.checked ? 'true' : 'false' }))}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="autoUpload" className="ml-2 block text-sm text-gray-900">
                        Auto Upload
                    </label>
                </div>
                {/* Upload Target */} 
                <div className="mb-6">
                    <label htmlFor="uploadTarget" className="block text-sm font-medium text-gray-700 mb-1">Upload Target</label>
                    <select
                        id="uploadTarget"
                        value={settings.upload_target || 'filemoon'}
                        onChange={(e) => setSettings(prev => ({ ...prev, upload_target: e.target.value as 'filemoon' | 'files_vc' | 'both' }))}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    >
                        <option value="filemoon">Filemoon</option>
                        <option value="files_vc">Files.vc</option>
                        <option value="both">Both</option>
                    </select>
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
             {/* *** UPDATED: Use filtered/sorted list length for display *** */} 
             <h2 className="text-2xl font-semibold">Download Queue ({displayedQueueItems.length} items)</h2>
             {/* --- Queue Controls (Filter, Sort, Clear) --- */} 
             <div className="flex items-center space-x-2">
                {/* --- Filter Dropdown --- */} 
                <div className="relative">
                    <button
                        onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                        className="px-3 py-1 text-xs font-medium rounded-md text-white bg-gray-500 hover:bg-gray-600 flex items-center"
                    >
                        Filter: {filterStatus}
                        <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    {showFilterDropdown && (
                        <div 
                            className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-20" // Increase z-index
                            onMouseLeave={() => setShowFilterDropdown(false)}
                        >
                            <div className="py-1" role="menu" aria-orientation="vertical">
                                {(['all', 'queued', 'downloading', 'completed', 'uploading', 'transferring', 'encoding', 'encoded', 'failed', 'cancelled'] as FilterStatus[]).map(status => (
                                    <button
                                        key={status}
                                        onClick={() => { setFilterStatus(status); setShowFilterDropdown(false); }}
                                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                                        role="menuitem"
                                    >
                                        {icons[status] || null} {status.charAt(0).toUpperCase() + status.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                {/* --- Sort Dropdown --- */} 
                <div className="relative">
                     <button
                         onClick={() => setShowSortDropdown(!showSortDropdown)}
                         className="px-3 py-1 text-xs font-medium rounded-md text-white bg-gray-500 hover:bg-gray-600 flex items-center"
                     >
                         Sort By...
                         <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                     </button>
                     {showSortDropdown && (
                         <div
                             className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-20" // Increase z-index
                             onMouseLeave={() => setShowSortDropdown(false)}
                         >
                             <div className="py-1" role="menu" aria-orientation="vertical">
                                 <button onClick={() => { setSortKey('added_at_desc'); setShowSortDropdown(false); }} className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${sortKey === 'added_at_desc' ? 'font-bold' : ''}`} role="menuitem">Date Added (Newest)</button>
                                 <button onClick={() => { setSortKey('added_at_asc'); setShowSortDropdown(false); }} className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${sortKey === 'added_at_asc' ? 'font-bold' : ''}`} role="menuitem">Date Added (Oldest)</button>
                                 <button onClick={() => { setSortKey('title_asc'); setShowSortDropdown(false); }} className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${sortKey === 'title_asc' ? 'font-bold' : ''}`} role="menuitem">Title (A-Z)</button>
                                 <button onClick={() => { setSortKey('title_desc'); setShowSortDropdown(false); }} className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${sortKey === 'title_desc' ? 'font-bold' : ''}`} role="menuitem">Title (Z-A)</button>
                                 <button onClick={() => { setSortKey('status'); setShowSortDropdown(false); }} className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${sortKey === 'status' ? 'font-bold' : ''}`} role="menuitem">Status</button>
                             </div>
                         </div>
                     )}
                 </div>
                 {/* --- Clear Button Dropdown --- */} 
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
          </div>

          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul role="list" className="divide-y divide-gray-200">
              {/* *** UPDATED: Use filtered/sorted list for display checks and mapping *** */}
              {displayedQueueItems.length === 0 && (
                <li className="px-4 py-4 text-center text-gray-500">
                  {filterStatus === 'all' ? 'Queue is empty.' : `No items match filter "${filterStatus}".`}
                </li>
              )}
              {/* *** UPDATED: Map over items using the new QueueListItem component *** */}
              {displayedQueueItems.map((item) => (
                <QueueListItem 
                  key={item.id}
                  item={item}
                  uploadingItemId={uploadingItemId}
                  cancellingItemId={cancellingItemId}
                  restartingItemId={restartingItemId}
                  retryingItemId={retryingItemId}
                  onUpload={handleUpload}
                  onCancel={handleCancel}
                  onRetry={handleRetry}
                  onRestartEncoding={handleRestartEncoding}
                  onOpenLink={handleOpenLink}
                />
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
