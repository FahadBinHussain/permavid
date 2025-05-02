'use client'; // Required for useState and event handlers

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { 
  ArrowDownTrayIcon, 
  ArrowUpTrayIcon, 
  XCircleIcon, 
  CheckCircleIcon, 
  ClockIcon, 
  ExclamationTriangleIcon, 
  ArrowPathIcon, // For retry
  Cog6ToothIcon, // For settings
  TrashIcon, // For clear
  LinkIcon, // For links
  ComputerDesktopIcon, // For encoding
  WifiIcon // For transferring
} from '@heroicons/react/24/solid';
import { invoke } from '@tauri-apps/api/tauri'; // Import invoke
import { open } from '@tauri-apps/api/shell'; // Import open for external links
import { useTauri } from '@/app/tauri-integration'; // Corrected import path
import { QueueItem, AppSettings } from '@/lib/tauri-api'; // <-- Import types
import { createEmptySettings } from '@/lib/settings-helper'; // Import factory function

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
  // Helper function to safely call handlers with ID
  const handleAction = (action: (id: string) => void) => {
    if (item.id) { // Check if ID exists
      action(item.id);
    } else {
      console.error('Attempted action on item without ID:', item);
    }
  };
  
  return (
    <li key={item.id ?? item.url} className="px-4 py-5 sm:px-6">
      <div className="flex items-start space-x-4">
          {item.thumbnail_url && (
            <div className="flex-shrink-0">
              <img 
                className="h-12 w-20 rounded object-cover"
                src={item.thumbnail_url} 
                alt="Video thumbnail"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
          )}

          <div className="flex-1 min-w-0"> 
              <div className="flex items-center justify-between space-x-2 mb-1">
                <div className="text-base font-semibold text-indigo-700 truncate flex-1 min-w-0" title={item.title || item.url}>
                  {item.title || item.url}
                </div>
                <div className="ml-2 flex-shrink-0 flex">
                  <p className={`px-2 py-0.5 inline-flex items-center text-xs leading-5 font-semibold rounded-full ${
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
                    {icons[item.status] || null} 
                    {item.status}
                  </p>
                </div>
              </div>
              <div className="mt-2 sm:flex sm:justify-between sm:items-center">
                <div className="sm:flex-1 min-w-0 mr-4">
                  {item.title && <p className="text-sm text-gray-500 truncate block">{item.url}</p>} 

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
                  {(!(item.status === 'downloading' && item.message?.startsWith('Downloading:')) && item.message) && ( 
                     <p className="text-xs italic text-gray-400 truncate block mt-1">- {item.message}</p> 
                  )} 
                </div> 
                 <div className="mt-2 sm:mt-0 flex-shrink-0 flex items-center space-x-2">
                     <button 
                         onClick={() => handleAction(onCancel)}
                         disabled={cancellingItemId === item.id}
                         className="px-2 py-1 text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed" 
                       > 
                         {cancellingItemId === item.id ? 'Cancelling...' : 'Cancel'} 
                       </button> 
                     {item.status === 'completed' && ( 
                       <button 
                         onClick={() => handleAction(onUpload)}
                         disabled={uploadingItemId === item.id}
                         className="px-2 py-1 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed" 
                       > 
                         {uploadingItemId === item.id ? 'Uploading...' : 'Upload'} 
                       </button> 
                     )} 
                     {(item.status === 'uploaded' || item.status === 'transferring' || item.status === 'encoding' || item.status === 'encoded') && item.filemoon_url && ( 
                       <button 
                         onClick={() => onOpenLink(item.filemoon_url)}
                         className="px-2 py-1 text-xs font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700" 
                       > 
                          View Link 
                       </button> 
                     )} 
                     {(item.status === 'uploaded' || item.status === 'transferring' || item.status === 'encoding' || item.status === 'encoded') && item.files_vc_url && ( 
                       <button 
                         onClick={() => onOpenLink(item.files_vc_url)}
                         className="px-2 py-1 text-xs font-medium rounded-md text-white bg-green-600 hover:bg-green-700" 
                       > 
                          View Link 
                       </button> 
                     )} 
                     {item.status === 'failed' && !item.filemoon_url && !item.files_vc_url && ( 
                       <button 
                         onClick={() => handleAction(onRetry)}
                         disabled={retryingItemId === item.id} 
                         className="px-2 py-1 text-xs font-medium rounded-md text-white bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed" 
                       > 
                         {retryingItemId === item.id ? 'Retrying...' : 'Retry'} 
                       </button> 
                     )} 
                     {item.status === 'failed' && item.filemoon_url && ( 
                       <button 
                         onClick={() => handleAction(onRestartEncoding)}
                         disabled={restartingItemId === item.id} 
                         className="px-2 py-1 text-xs font-medium rounded-md text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed" 
                       > 
                         {restartingItemId === item.id ? 'Restarting...' : 'Restart Encoding'} 
                       </button> 
                     )} 
                     {item.status === 'encoding' && ( 
                       <div className="w-24 bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 flex items-center">
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
  // Use the Tauri context hook
  const {
    queueItems: contextQueue,
    fetchQueueItems: tauriFetchQueue,
    getAppSettings: tauriGetAppSettings,
    addToQueue: tauriAddToQueue,
    clearItems: tauriClearItems,
    retryItem: tauriRetryItem,
    saveAppSettings: tauriSaveSettings,
    triggerUpload: tauriTriggerUpload,
    cancelItem: tauriCancelItem,
    restartEncoding: tauriRestartEncoding
  } = useTauri();

  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [cancellingItemId, setCancellingItemId] = useState<string | null>(null);
  const [restartingItemId, setRestartingItemId] = useState<string | null>(null);
  const [retryingItemId, setRetryingItemId] = useState<string | null>(null);

  // --- Settings State ---
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [showClearDropdown, setShowClearDropdown] = useState(false);
  type FilterStatus = QueueItem['status'] | 'all';
  type SortKey = 'added_at_desc' | 'added_at_asc' | 'title_asc' | 'title_desc' | 'status';
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('added_at_desc');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const fetchQueue = useCallback(async () => {
    try {
      console.log('Home: Fetching queue via Tauri...');
      await tauriFetchQueue(); // Call the destructured function
    } catch (fetchError: any) {
      console.error('Home: Error fetching queue via Tauri context:', fetchError);
    }
  }, [tauriFetchQueue]);

  const fetchSettings = useCallback(async () => {
    try {
      console.log('Home: Fetching settings via Tauri...');
      await tauriGetAppSettings(); // Call the destructured function
    } catch (fetchError: any) {
      console.error('Home: Error fetching settings via Tauri context:', fetchError);
      setError('Failed to load application settings. Using defaults.');
    }
  }, [tauriGetAppSettings]);

  useEffect(() => {
    // Initial fetch
    fetchQueue();
    fetchSettings();

    let intervalId: NodeJS.Timeout | null = null;

    // Only set the interval if the settings modal is NOT open
    if (!showSettingsModal) {
      console.log('Settings modal closed, starting queue fetch interval.');
      intervalId = setInterval(fetchQueue, 5000); // Increased interval slightly
    } else {
      console.log('Settings modal open, interval fetch paused.');
    }

    // Cleanup function: clear interval if it exists
    return () => {
      if (intervalId) {
        console.log('Cleaning up queue fetch interval.');
        clearInterval(intervalId);
      }
    };
    // Add showSettingsModal to dependency array to re-run effect when it changes
  }, [fetchQueue, fetchSettings, showSettingsModal]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');
    setError('');

    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        setError('Invalid URL format');
        setIsLoading(false);
        return;
    }

    try {
      const newItem: Partial<QueueItem> = {
          url: url,
          status: 'queued',
      };
      
      const newItemId = await tauriAddToQueue(newItem as QueueItem); 
      
      setMessage(`URL added to queue (ID: ${newItemId})`);
      setUrl('');
    } catch (submitError: any) {
      // Convert the caught error to a string for checking
      const errorString = String(submitError);
      let finalErrorMessage = 'Failed to add URL. Please check the URL or try again.'; // Default generic message

      // Check the error string for our specific duplicate/archived URL messages from Rust
      const isAlreadyArchived = errorString.includes("has already been archived");
      const isAlreadyInQueue = errorString.includes("already exists in the active queue");

      if (isAlreadyArchived || isAlreadyInQueue) {
        finalErrorMessage = errorString; // Use the specific message from Rust
        // Don't log these expected errors to the console
      } else {
        // Log unexpected errors to the console for debugging
        console.error('Unexpected submission error object via Tauri:', submitError);
        // Determine the best message for unexpected errors
        if (submitError?.message && submitError.message.toLowerCase() !== 'failed to add url') {
          finalErrorMessage = submitError.message;
        } else if (!errorString.toLowerCase().includes('failed to add url')) {
          finalErrorMessage = errorString;
        }
        // If it's an unexpected error but the message is still generic, keep the improved default.
      }
      
      setError(finalErrorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearQueue = async (type: 'completed' | 'failed' | 'finished' | 'cancelled') => {
    setIsClearing(true);
    setMessage('');
    setError('');
    try {
      // Convert single type string to Vec<String> for the Rust command
      const statusTypes = [type]; 
      
      // Use the Tauri context function
      await tauriClearItems(statusTypes); 
      
      // Assuming success if no error is thrown by invoke
      setMessage(`Successfully requested clearing of ${type} items.`);
      
    } catch (clearError: any) {
      console.error(`Error clearing ${type} items via Tauri:`, clearError);
      setError(`Failed to clear ${type} items: ${clearError.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  const handleUpload = async (itemId: string) => {
    setUploadingItemId(itemId);
    setMessage('');
    setError('');
    try {
      // Call the Tauri context function
      const result = await tauriTriggerUpload(itemId); 
      
      if (result.success) {
        setMessage(result.message || `Upload initiated/completed for item ${itemId}.`);
      } else {
        throw new Error(result.message || 'Upload failed via Tauri');
      }
    } catch (uploadError: any) {
      console.error(`Error uploading item ${itemId} via Tauri:`, uploadError);
      setError(`Failed to upload item ${itemId}: ${uploadError.message}`);
    } finally {
      setUploadingItemId(null);
    }
  };

  const handleCancel = async (itemId: string) => {
    setCancellingItemId(itemId);
    setMessage('');
    setError('');
    try {
      // Call the Tauri context function
      const result = await tauriCancelItem(itemId);

      if (result.success) {
        setMessage(result.message || `Cancellation processed for item ${itemId}.`);
      } else {
        throw new Error(result.message || 'Cancellation failed via Tauri');
      }
    } catch (cancelError: any) {
      console.error(`Error cancelling item ${itemId} via Tauri:`, cancelError);
      setError(`Failed to cancel item ${itemId}: ${cancelError.message}`);
    } finally {
      setCancellingItemId(null);
    }
  };

  const handleRetry = async (itemId: string) => {
    setRetryingItemId(itemId);
    setMessage('');
    setError('');
    try {
      await tauriRetryItem(itemId);
      setMessage('Item re-queued successfully.');
    } catch (retryError: any) {
      console.error(`Error retrying item ${itemId} via Tauri:`, retryError);
      setError(`Failed to retry item ${itemId}: ${retryError.message}`);
    } finally {
      setRetryingItemId(null);
    }
  };

  const handleRestartEncoding = async (itemId: string) => {
    setRestartingItemId(itemId);
    setMessage('');
    setError('');
    try {
      // Call the Tauri context function
      const result = await tauriRestartEncoding(itemId);

      if (result.success) {
        setMessage(result.message || `Restart encoding request sent for item ${itemId}.`);
      } else {
        throw new Error(result.message || 'Restart encoding failed via Tauri');
      }
    } catch (restartError: any) {
      console.error(`Error restarting encoding for item ${itemId} via Tauri:`, restartError);
      setError(`Failed to restart encoding for item ${itemId}: ${restartError.message}`);
    } finally {
      setRestartingItemId(null);
    }
  };

  const handleSaveSettings = async (modalLocalSettings: AppSettings) => {
    setIsSavingSettings(true);
    setMessage('');
    setError('');
    try {
      console.log("Attempting to save settings:", modalLocalSettings);
      await tauriSaveSettings(modalLocalSettings); // Call the context save function
      setMessage('Settings saved successfully.');
      setShowSettingsModal(false); // Close modal on successful save
    } catch (saveError: any) {
      console.error('Error saving settings:', saveError);
      setError(`Failed to save settings: ${saveError.message}`);
      // Keep modal open on error
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleOpenLink = async (filecode: string | null | undefined) => {
    console.log('handleOpenLink called with filecode:', filecode);
    if (!filecode) return;
    
    let url;
    if (filecode.startsWith('https://')) {
      url = filecode;
    } else if (filecode.startsWith('files_vc:')) {
      const code = filecode.replace('files_vc:', '');
      url = `https://files.vc/d/${code}`;
    } else {
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
      console.warn('Electron API not found, opening link directly (may open in app window).');
      window.open(url, '_blank');
    }
  };

  const displayedQueueItems = contextQueue
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
          return 0;
      }
    });

  const SettingsModal = () => {
    // Initialize modal's local state
    const [modalSettings, setModalSettings] = useState<AppSettings>(createEmptySettings());
    const [isLoadingSettings, setIsLoadingSettings] = useState(true); // Add loading state

    // Fetch initial settings when modal mounts
    useEffect(() => {
      setIsLoadingSettings(true);
      tauriGetAppSettings() // Call the getAppSettings function from context
        .then(fetchedSettings => {
          setModalSettings(fetchedSettings || createEmptySettings());
        })
        .catch(err => {
          console.error("Error fetching settings for modal:", err);
          // Keep default empty settings on error
        })
        .finally(() => {
          setIsLoadingSettings(false);
        });
    }, []); // Empty dependency array: run only once when modal mounts

    const handleModalSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        handleSaveSettings(modalSettings); // Pass local modal state to save handler
    }

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex justify-center items-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-lg">
                <h2 className="text-2xl font-bold mb-6">Application Settings</h2>
                
                {isLoadingSettings ? (
                  <p>Loading settings...</p>
                ) : (
                  <form onSubmit={handleModalSubmit}>
                    <div className="mb-4">
                        <label htmlFor="filemoonApiKey" className="block text-sm font-medium text-gray-700 mb-1">Filemoon API Key</label>
                        <input
                            id="filemoonApiKey"
                            type="text" 
                            value={modalSettings.filemoon_api_key || ''}
                            onChange={(e) => setModalSettings(prev => ({ ...prev, filemoon_api_key: e.target.value }))}
                            placeholder="Enter your Filemoon API Key"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black"
                        />
                    </div>
                    <div className="mb-4">
                        <label htmlFor="filesVcApiKey" className="block text-sm font-medium text-gray-700 mb-1">Files.vc API Key</label>
                        <input
                            id="filesVcApiKey"
                            type="text" 
                            value={modalSettings.files_vc_api_key || ''}
                            onChange={(e) => setModalSettings(prev => ({ ...prev, files_vc_api_key: e.target.value }))}
                            placeholder="Enter your Files.vc API Key"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black"
                        />
                    </div>
                    <div className="mb-4">
                        <label htmlFor="downloadDir" className="block text-sm font-medium text-gray-700 mb-1">Download Directory</label>
                        <input
                            id="downloadDir"
                            type="text"
                            value={modalSettings.download_directory || ''}
                            onChange={(e) => setModalSettings(prev => ({ ...prev, download_directory: e.target.value }))}
                            placeholder="e.g., C:\Users\You\Downloads\PermaVid"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-black"
                        />
                        <p className="mt-1 text-xs text-gray-500">Enter the full path for downloads.</p>
                    </div>
                    <div className="mb-6 flex items-center">
                        <input
                            id="deleteAfterUpload"
                            type="checkbox"
                            checked={modalSettings.delete_after_upload === 'true'}
                            onChange={(e) => setModalSettings(prev => ({ ...prev, delete_after_upload: e.target.checked ? 'true' : 'false' }))}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label htmlFor="deleteAfterUpload" className="ml-2 block text-sm text-gray-900">
                            Delete local file after successful upload
                        </label>
                    </div>
                    <div className="mb-6 flex items-center">
                        <input
                            id="autoUpload"
                            type="checkbox"
                            checked={modalSettings.auto_upload === 'true'}
                            onChange={(e) => setModalSettings(prev => ({ ...prev, auto_upload: e.target.checked ? 'true' : 'false' }))}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label htmlFor="autoUpload" className="ml-2 block text-sm text-gray-900">
                            Auto Upload
                        </label>
                    </div>
                    <div className="mb-6">
                        <label htmlFor="uploadTarget" className="block text-sm font-medium text-gray-700 mb-1">Upload Target</label>
                        <select
                            id="uploadTarget"
                            value={modalSettings.upload_target || 'filemoon'}
                            onChange={(e) => setModalSettings(prev => ({ ...prev, upload_target: e.target.value as 'filemoon' | 'files_vc' | 'both' }))}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        >
                            <option value="filemoon">Filemoon</option>
                            <option value="files_vc">Files.vc</option>
                            <option value="both">Both</option>
                        </select>
                    </div>

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
                )}
            </div>
        </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-24">
       <button 
            onClick={() => setShowSettingsModal(true)}
            className="absolute top-4 right-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
        >
            Settings
        </button>
        <Link 
            href="/gallery" 
            className="absolute top-4 right-24 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
        >
            View Gallery
        </Link>

      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm flex flex-col">
        <h1 className="text-3xl md:text-4xl font-bold mb-8">PermaVid URL Adder & Queue</h1>

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

        {message && (
          <p className="mt-4 text-green-600 text-center mb-4">{message}</p>
        )}
        {error && (
          <p className="mt-4 text-red-600 text-center mb-4">{error}</p>
        )}

        <div className="w-full max-w-4xl">
          <div className="flex justify-between items-center mb-4">
             <h2 className="text-2xl font-semibold">Download Queue ({displayedQueueItems.length} items)</h2>
             <div className="flex items-center space-x-2">
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
                            className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-20"
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
                             className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-20"
                             onMouseLeave={() => setShowSortDropdown(false)}
                         >
                             <div className="py-1" role="menu" aria-orientation="vertical">
                                 <button onClick={() => { setSortKey('added_at_desc'); setShowSortDropdown(false); }} className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${sortKey === 'added_at_desc' ? 'font-bold' : ''}`}>Added (Newest First)</button>
                                 <button onClick={() => { setSortKey('added_at_asc'); setShowSortDropdown(false); }} className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${sortKey === 'added_at_asc' ? 'font-bold' : ''}`}>Added (Oldest First)</button>
                                 <button onClick={() => { setSortKey('title_asc'); setShowSortDropdown(false); }} className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${sortKey === 'title_asc' ? 'font-bold' : ''}`}>Title (A-Z)</button>
                                 <button onClick={() => { setSortKey('title_desc'); setShowSortDropdown(false); }} className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${sortKey === 'title_desc' ? 'font-bold' : ''}`}>Title (Z-A)</button>
                                 <button onClick={() => { setSortKey('status'); setShowSortDropdown(false); }} className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${sortKey === 'status' ? 'font-bold' : ''}`}>Status</button>
                             </div>
                         </div>
                     )}
                 </div>
                 <div className="relative">
                     <button
                         onClick={() => setShowClearDropdown(!showClearDropdown)}
                         disabled={isClearing}
                         className="px-3 py-1 text-xs font-medium rounded-md text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 flex items-center"
                     >
                         Clear...
                         <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                     </button>
                     {showClearDropdown && (
                         <div
                             className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-20"
                             onMouseLeave={() => setShowClearDropdown(false)}
                         >
                             <div className="py-1" role="menu" aria-orientation="vertical">
                                 <button onClick={() => { handleClearQueue('completed'); setShowClearDropdown(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">Clear Completed</button>
                                 <button onClick={() => { handleClearQueue('failed'); setShowClearDropdown(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">Clear Failed</button>
                                 <button onClick={() => { handleClearQueue('cancelled'); setShowClearDropdown(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">Clear Cancelled</button>
                                 <button onClick={() => { handleClearQueue('finished'); setShowClearDropdown(false); }} className="block w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50 font-medium" role="menuitem">Clear All Finished</button>
                             </div>
                         </div>
                     )}
                 </div>
             </div>
           </div>

           <div className="bg-white shadow overflow-hidden sm:rounded-md mt-4">
             <ul role="list" className="divide-y divide-gray-200">
               {displayedQueueItems.length === 0 ? (
                 <li className="px-4 py-4 sm:px-6 text-center text-gray-500">
                   No items in the queue{filterStatus !== 'all' ? ` matching filter '${filterStatus}'` : ''}. Add a URL above!
                 </li>
               ) : (
                 displayedQueueItems.map((item) => (
                   <QueueListItem
                     key={item.id ?? item.url}
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
                 ))
               )}
             </ul>
           </div>
        </div>
      </div>

      {showSettingsModal && <SettingsModal />}
    </main>
  );
}
