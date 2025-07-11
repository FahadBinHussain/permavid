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
  WifiIcon, // For transferring
  ChevronDownIcon, // For dropdowns
  PlusIcon, // For add button
  QueueListIcon, // Generic queued
  ArrowDownCircleIcon, // Downloading
  CheckBadgeIcon, // Completed/Encoded
  ArrowUpCircleIcon, // Uploading/Transferring
  CpuChipIcon, // Encoding
  ExclamationCircleIcon, // Failed
  NoSymbolIcon, // Cancelled
  Bars3Icon, // All filter
  AdjustmentsHorizontalIcon, // Filter button icon
  ArrowsUpDownIcon, // Sort button icon
  SparklesIcon, // Gallery icon
  ArrowPathRoundedSquareIcon, // For refresh button
} from '@heroicons/react/24/solid'; 
import { invoke } from '@tauri-apps/api/tauri'; // Import invoke
import { open } from '@tauri-apps/api/shell'; // Import open for external links
import { useTauri } from '@/app/tauri-integration'; // Corrected import path
import { QueueItem, AppSettings } from '@/lib/tauri-api'; // <-- Import types
import { createEmptySettings } from '@/lib/settings-helper'; // Import factory function
import { listen } from '@tauri-apps/api/event'; // <-- Import listen
import { toast } from 'react-hot-toast';
import UserProfile from '@/components/UserProfile';

// --- Updated Icons with consistent size ---
const iconClass = "h-4 w-4 inline-block mr-1.5 align-text-bottom"; // Consistent icon styling
const icons: { [key: string]: React.JSX.Element } = {
  queued: <QueueListIcon className={iconClass + " text-gray-500"} />,
  downloading: <ArrowDownCircleIcon className={iconClass + " text-blue-500 animate-pulse"} />,
  completed: <CheckBadgeIcon className={iconClass + " text-green-500"} />,
  uploading: <ArrowUpCircleIcon className={iconClass + " text-purple-500 animate-pulse"} />,
  transferring: <WifiIcon className={iconClass + " text-sky-500 animate-pulse"} />, // Changed icon
  encoding: <CpuChipIcon className={iconClass + " text-cyan-500 animate-spin"} />, // Changed icon
  encoded: <CheckBadgeIcon className={iconClass + " text-indigo-500"} />, // Use CheckBadgeIcon for consistency
  failed: <ExclamationCircleIcon className={iconClass + " text-red-500"} />,
  cancelled: <NoSymbolIcon className={iconClass + " text-gray-400"} />,
  all: <Bars3Icon className={iconClass + " text-gray-500"} />,
};

// --- Color mapping for badges/progress ---
const statusColors: { [key: string]: { bg: string; text: string; progress: string } } = {
  queued: { bg: 'bg-gray-100', text: 'text-gray-700', progress: 'bg-gray-400' },
  downloading: { bg: 'bg-blue-100', text: 'text-blue-700', progress: 'bg-blue-500' },
  completed: { bg: 'bg-green-100', text: 'text-green-700', progress: 'bg-green-500' },
  uploading: { bg: 'bg-purple-100', text: 'text-purple-700', progress: 'bg-purple-500' },
  transferring: { bg: 'bg-sky-100', text: 'text-sky-700', progress: 'bg-sky-500' },
  encoding: { bg: 'bg-cyan-100', text: 'text-cyan-700', progress: 'bg-cyan-500' },
  encoded: { bg: 'bg-indigo-100', text: 'text-indigo-700', progress: 'bg-indigo-500' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', progress: 'bg-red-500' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-500', progress: 'bg-gray-400' },
  default: { bg: 'bg-gray-100', text: 'text-gray-700', progress: 'bg-gray-400' },
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

  const colors = statusColors[item.status] || statusColors.default;

  // Function to render action buttons - improved styling
  const renderButton = (
    label: string, 
    action: () => void, 
    bgColor: string, 
    hoverColor: string, 
    disabled: boolean, 
    loadingLabel: string, 
    icon?: React.ReactNode
  ) => (
    <button 
      onClick={action}
      disabled={disabled}
      className={`px-2.5 py-1 text-xs font-medium rounded-md text-white ${bgColor} ${hoverColor} disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150 flex items-center space-x-1`}
    >
      {icon}
      <span>{disabled ? loadingLabel : label}</span>
    </button> 
  );
  
  return (
    <li key={item.id ?? item.url} className="px-4 py-4 sm:px-6 hover:bg-gray-50 transition-colors duration-150">
      <div className="flex items-start space-x-4">
          {item.thumbnail_url ? (
            <div className="flex-shrink-0">
              <img 
                className="h-16 w-28 rounded-md object-cover border border-gray-200" // Slightly larger, rounded, border
                src={item.thumbnail_url} 
                alt="Video thumbnail"
                onError={(e) => { 
                  e.currentTarget.style.display = 'none'; 
                  // Optionally show a placeholder:
                  // e.currentTarget.parentElement?.insertAdjacentHTML('beforeend', '<div class="h-16 w-28 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 text-xs">No thumb</div>'); 
                }}
              />
            </div>
          ) : (
            // Placeholder if no thumbnail
            <div className="flex-shrink-0 h-16 w-28 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 text-xs">
              No thumb
            </div>
          )}

          <div className="flex-1 min-w-0"> 
              {/* Top row: Title and Status Badge */}
              <div className="flex items-center justify-between space-x-3 mb-1">
                <p className="text-sm font-semibold text-gray-900 truncate flex-1 min-w-0" title={item.title || item.url}>
                  {item.title || item.url}
                </p>
                <span className={`px-2.5 py-0.5 inline-flex items-center text-xs leading-5 font-medium rounded-full ${colors.bg} ${colors.text}`}> 
                  {icons[item.status] || null} 
                  <span className="capitalize">{item.status}</span>
                </span>
              </div>

              {/* Second row: URL */}
              {item.title && <p className="text-xs text-gray-500 truncate block mb-1">{item.url}</p>} 

              {/* Third row: Progress or Message */}
              <div className="text-xs text-gray-600 mt-1 min-h-[1.25rem]"> {/* Min height to prevent layout shifts */}
                {item.status === 'downloading' && item.message?.startsWith('Downloading:') &&
                  <div className="flex items-center"> 
                    <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700 mr-2"> 
                      <div 
                        className={`${colors.progress} h-1.5 rounded-full transition-all duration-300 ease-out`} 
                        style={{ width: `${item.message.match(/(\d+(\.\d+)?)%/)?.[1] ?? 0}%` }} 
                      ></div> 
                    </div> 
                    <span className={`font-medium ${colors.text} whitespace-nowrap`}> 
                      {item.message.match(/(\d+(\.\d+)?)%/)?.[0] ?? '0%'} 
                    </span> 
                  </div> 
                } 
                {item.status === 'encoding' && item.encoding_progress !== null && item.encoding_progress !== undefined &&
                  <div className="flex items-center">
                    <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700 mr-2">
                      <div 
                        className={`${colors.progress} h-1.5 rounded-full transition-all duration-300 ease-out`} 
                        style={{ width: `${item.encoding_progress}%` }} 
                      > 
                      </div> 
                    </div> 
                     <span className={`font-medium ${colors.text} whitespace-nowrap`}>{`${item.encoding_progress}%`}</span> 
                   </div> 
                } 
                {/* Display message if not a progress message */}
                {(!(item.status === 'downloading' && item.message?.startsWith('Downloading:')) && !(item.status === 'encoding' && item.encoding_progress !== null) && item.message) && ( 
                   <p className="italic text-gray-500 truncate block">- {item.message}</p> 
                )} 
              </div> 
              
              {/* Fourth row: Action Buttons */}
              <div className="mt-3 flex flex-wrap gap-2 items-center"> {/* Use gap for spacing */}
                  {/* Cancel Button (Show only for specific states) */}
                  {(item.status === 'queued' || item.status === 'downloading' || item.status === 'uploading') && (
                    renderButton(
                      'Cancel',
                      () => handleAction(onCancel),
                      'bg-red-500',
                      'hover:bg-red-600',
                      cancellingItemId === item.id,
                      'Cancelling...',
                      <XCircleIcon className="h-3.5 w-3.5" />
                    )
                  )}
                   {/* Upload Button */}
                   {(item.status === 'completed' || item.status === 'encoded') && ( 
                     renderButton(
                       'Upload',
                       () => handleAction(onUpload),
                       'bg-blue-600',
                       'hover:bg-blue-700',
                       uploadingItemId === item.id,
                       'Uploading...',
                       <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                     )
                   )} 
                   {/* View Link Buttons */}
                   {(item.status === 'uploaded' || item.status === 'transferring' || item.status === 'encoding' || item.status === 'encoded') && item.filemoon_url && ( 
                     renderButton(
                       'Filemoon Link',
                       () => onOpenLink(item.filemoon_url),
                       'bg-purple-600',
                       'hover:bg-purple-700',
                       false, // Not disableable
                       '',    // No loading state needed
                       <LinkIcon className="h-3.5 w-3.5" />
                     ) 
                   )} 
                   {(item.status === 'uploaded' || item.status === 'transferring' || item.status === 'encoding' || item.status === 'encoded') && item.files_vc_url && ( 
                     renderButton(
                       'Files.vc Link',
                       () => onOpenLink(item.files_vc_url),
                       'bg-emerald-600', // Changed color
                       'hover:bg-emerald-700',
                       false,
                       '',
                       <LinkIcon className="h-3.5 w-3.5" />
                     ) 
                   )} 
                   {/* Retry Download/Upload Button */}
                   {item.status === 'failed' && !item.filemoon_url && !item.files_vc_url && ( 
                     renderButton(
                       // Show "Retry Upload" if there's a local path or upload-related error message
                       (item.local_path || 
                        (item.message && (
                          item.message.includes("API key") || 
                          item.message.includes("Upload") || 
                          item.message.includes("upload") || 
                          item.message.includes("Filemoon") || 
                          item.message.includes("Files.vc")
                        )) 
                        ? 'Retry Upload' 
                        : 'Retry'),
                       () => handleAction(onRetry),
                       'bg-yellow-500',
                       'hover:bg-yellow-600',
                       retryingItemId === item.id, 
                       'Retrying...',
                       <ArrowPathIcon className="h-3.5 w-3.5" />
                     ) 
                   )} 
                   {/* Restart Encoding Button */}
                   {item.status === 'failed' && item.filemoon_url && ( 
                     renderButton(
                       'Restart Encoding',
                       () => handleAction(onRestartEncoding),
                       'bg-orange-500',
                       'hover:bg-orange-600',
                       restartingItemId === item.id, 
                       'Restarting...',
                       <ArrowPathIcon className="h-3.5 w-3.5" />
                     ) 
                   )} 
               </div> 
          </div>
      </div>
    </li>
  );
};

// Define the payload type for the download_complete event
interface DownloadCompletePayload {
  id: string;
  originalUrl: string;
  title?: string;
  localPath?: string;
  thumbnailUrl?: string;
}

export default function Home() {
  // Use the Tauri context hook
  const {
    queueItems: contextQueue,
    fetchQueueItems: tauriFetchQueueItems,
    getAppSettings: tauriGetAppSettings,
    addToQueue: tauriAddToQueue,
    clearItems: tauriClearItems,
    retryItem: tauriRetryItem,
    saveAppSettings: tauriSaveSettings,
    triggerUpload: tauriTriggerUpload,
    cancelItem: tauriCancelItem,
    restartEncoding: tauriRestartEncoding,
    openLink: tauriOpenLink,
    getGalleryItems: tauriGetGalleryItems
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- Settings State ---
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [missingApiKey, setMissingApiKey] = useState(false); // Track if modal opened due to missing API key

  const [showClearDropdown, setShowClearDropdown] = useState(false);
  type FilterStatus = QueueItem['status'] | 'all';
  type SortKey = 'added_at_desc' | 'added_at_asc' | 'title_asc' | 'title_desc' | 'status';
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('added_at_desc');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Refs for dropdown handling
  const filterButtonRef = React.useRef<HTMLButtonElement>(null);
  const sortButtonRef = React.useRef<HTMLButtonElement>(null);
  const clearButtonRef = React.useRef<HTMLButtonElement>(null);

  // Handle clicks outside of dropdowns to close them
  useEffect(() => {
    if (!showFilterDropdown && !showSortDropdown && !showClearDropdown) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      // Check if click was inside any of the active dropdowns or their toggle buttons
      const target = e.target as Node;
      
      // Handle Filter dropdown
      const isFilterDropdownClick = filterButtonRef.current?.contains(target);
      if (showFilterDropdown && !isFilterDropdownClick) {
        setShowFilterDropdown(false);
      }
      
      // Handle Sort dropdown
      const isSortDropdownClick = sortButtonRef.current?.contains(target);
      if (showSortDropdown && !isSortDropdownClick) {
        setShowSortDropdown(false);
      }
      
      // Handle Clear dropdown
      const isClearDropdownClick = clearButtonRef.current?.contains(target);
      if (showClearDropdown && !isClearDropdownClick) {
        setShowClearDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilterDropdown, showSortDropdown, showClearDropdown]);

  const fetchQueue = useCallback(async () => {
    try {
      setIsRefreshing(true);
      await tauriFetchQueueItems(); 
    } catch (fetchError: any) {
      console.error('Home: Error fetching queue via Tauri context:', fetchError);
    } finally {
      setIsRefreshing(false);
    }
  }, [tauriFetchQueueItems]);

  const fetchSettings = useCallback(async () => {
    try {
      await tauriGetAppSettings(); 
    } catch (fetchError: any) {
      console.error('Home: Error fetching settings via Tauri context:', fetchError);
      setError('Failed to load application settings. Using defaults.');
    }
  }, [tauriGetAppSettings]);

  useEffect(() => {
    fetchQueue();
    fetchSettings();
    let intervalId: NodeJS.Timeout | null = null;
    if (!showSettingsModal) {
      intervalId = setInterval(fetchQueue, 5000); 
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [fetchQueue, fetchSettings, showSettingsModal]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Use Tauri API for desktop app
      const newItem: Partial<QueueItem> = {
        url: url,
        status: 'queued'
      };
      
      try {
        // addToQueue returns a string ID on success
        const id = await tauriAddToQueue(newItem as QueueItem);
        setUrl('');
        // Refresh the queue
        fetchQueue();
        // Show success toast
        toast.success('URL added to queue successfully');
      } catch (apiError: any) {
        setError(apiError.message || 'Failed to add URL to queue');
        toast.error(apiError.message || 'Failed to add URL to queue');
      }
    } catch (error) {
      console.error('Error adding URL to queue:', error);
      setError('An error occurred while adding URL to queue');
      toast.error('An error occurred while adding URL to queue');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearQueue = async (type: 'completed' | 'failed' | 'encoded' | 'cancelled' | 'all_finished') => { // Added 'encoded', 'all_finished'
    setIsClearing(true);
    setMessage('');
    setError('');
    try {
      let statusTypes: string[];
      if (type === 'all_finished') {
        // Clear completed, encoded, cancelled - essentially anything done or stopped
        statusTypes = ['completed', 'encoded', 'cancelled', 'failed']; // Include failed for 'all finished'? Or separate? Let's include it.
      } else {
         statusTypes = [type]; 
      }
      
      await tauriClearItems(statusTypes); 
      
      // Force refresh the queue items after clearing
      await fetchQueue();
      
      setMessage(`Successfully cleared ${type.replace('_', ' ')} items.`);
      setShowClearDropdown(false); // Close dropdown after action
      
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
      // Prevent any unhandled rejections or unexpected errors
      const result = await tauriTriggerUpload(itemId).catch(err => {
        return { 
          success: false, 
          message: err instanceof Error ? err.message : String(err) 
        };
      });
      
      if (result.success) {
        setMessage(result.message || `Upload initiated/completed for item ${itemId}.`);
      } else {
        // Check for specific API key error
        if (result.message && result.message.includes("API key not configured")) {
          setError("Please configure your Filemoon API key in settings to upload files.");
          // Set flag and open settings modal
          setMissingApiKey(true);
          setShowSettingsModal(true);
          // Use toast for additional notification
          toast.error("API key missing. Opening settings...");
          return;
        }
        throw new Error(result.message || 'Upload failed via Tauri');
      }
    } catch (uploadError: any) {
      console.error(`Error uploading item ${itemId} via Tauri:`, uploadError);
      
      // Check error message for API key issues as well (in case it comes through the catch block)
      const errorMsg = uploadError.message || String(uploadError);
      if (errorMsg.includes("API key not configured")) {
        setError("Please configure your Filemoon API key in settings to upload files.");
        // Set flag and open settings modal
        setMissingApiKey(true);
        setShowSettingsModal(true);
        // Use toast for additional notification
        toast.error("API key missing. Opening settings...");
      } else {
        setError(`Failed to upload item ${itemId}: ${errorMsg}`);
      }
    } finally {
      setUploadingItemId(null);
    }
  };

  const handleCancel = async (itemId: string) => {
    setCancellingItemId(itemId);
    setMessage('');
    setError('');
    try {
      const result = await tauriCancelItem(itemId);
      if (result.success) {
        setMessage(result.message || `Cancellation processed for item ${itemId}.`);
      } else {
        throw new Error(result.message || 'Cancellation failed via Tauri');
      }
    } catch (cancelError: any) {
      console.error(`Error cancelling item ${itemId} via Tauri:`, cancelError);
      setError(`Failed to cancel item ${itemId}: ${cancelError.message || String(cancelError)}`);
    } finally {
      setCancellingItemId(null);
    }
  };

  const handleRetry = async (itemId: string) => {
    setRetryingItemId(itemId);
    setMessage('');
    setError('');
    
    try {
      const responseMessage = await tauriRetryItem(itemId);
      
      // If response contains an error indication, handle it
      if (responseMessage.includes('failed') || responseMessage.includes('Failed') || responseMessage.includes('error') || responseMessage.includes('Error')) {
        // API key specific error handling
        if (responseMessage.includes("API key not configured")) {
          setError("Please configure your Filemoon API key in settings to upload files.");
          // Set flag and open settings modal
          setMissingApiKey(true);
          setShowSettingsModal(true);
          // Use toast for additional notification
          toast.error("API key missing. Opening settings...");
          return;
        }
        
        // General error handling
        setError(`Failed to retry item: ${responseMessage}`);
        return;
      }
      
      // Check if this is an upload retry based on the response message
      if (responseMessage && responseMessage.includes("prepared for upload retry")) {
        // If this was an upload retry, automatically trigger the upload
        setMessage('Retrying upload...');
        try {
          // Prevent any unhandled rejections or unexpected errors
          const uploadResult = await tauriTriggerUpload(itemId).catch(err => {
            return { 
              success: false, 
              message: err instanceof Error ? err.message : String(err) 
            };
          });
          
          if (uploadResult.success) {
            setMessage(uploadResult.message || 'Upload retriggered successfully.');
          } else {
            // Check for API key error
            if (uploadResult.message && uploadResult.message.includes("API key not configured")) {
              setError("Please configure your Filemoon API key in settings to upload files.");
              // Set flag and open settings modal
              setMissingApiKey(true);
              setShowSettingsModal(true);
              // Use toast for additional notification
              toast.error("API key missing. Opening settings...");
              return;
            }
            setError(uploadResult.message || 'Upload retriggering failed');
          }
        } catch (uploadError: any) {
          // This catch block should rarely be executed now with our improved error handling
          console.error(`Error retriggering upload for item ${itemId}:`, uploadError);
          
          // Check error message for API key issues
          const errorMsg = uploadError.message || String(uploadError);
          if (errorMsg.includes("API key not configured")) {
            setError("Please configure your Filemoon API key in settings to upload files.");
            // Set flag and open settings modal
            setMissingApiKey(true);
            setShowSettingsModal(true);
            // Use toast for additional notification
            toast.error("API key missing. Opening settings...");
          } else {
            setError(`Failed to retrigger upload: ${errorMsg}`);
          }
        }
      } else {
        // Normal download retry
        setMessage(responseMessage || 'Item re-queued successfully.');
      }
    } catch (retryError: any) {
      // This catch block should rarely be executed now with our improved error handling
      console.error(`Error retrying item ${itemId} via Tauri:`, retryError);
      setError(`Failed to retry item ${itemId}: ${retryError.message || String(retryError)}`);
    } finally {
      setRetryingItemId(null);
    }
  };

  const handleRestartEncoding = async (itemId: string) => {
    setRestartingItemId(itemId);
    setMessage('');
    setError('');
    try {
      const result = await tauriRestartEncoding(itemId);
      if (result.success) {
        setMessage(result.message || `Restart encoding request sent for item ${itemId}.`);
      } else {
        throw new Error(result.message || 'Restart encoding failed via Tauri');
      }
    } catch (restartError: any) {
      console.error(`Error restarting encoding for item ${itemId} via Tauri:`, restartError);
      setError(`Failed to restart encoding for item ${itemId}: ${restartError.message || String(restartError)}`);
    } finally {
      setRestartingItemId(null);
    }
  };
  
  // --- MODIFIED: Save Settings Logic ---
  const handleSaveSettings = async (settingsToSave: AppSettings) => {
    setIsSavingSettings(true);
    setMessage('');
    setError('');
    
    try {
      // Save the settings via Tauri
      console.log("Saving settings:", settingsToSave);
      await tauriSaveSettings(settingsToSave); 
      
      setMessage('Settings saved successfully.');
      setShowSettingsModal(false); 
      setMissingApiKey(false); // Reset the missing API key flag
      
      // Show success toast
      toast.success('Settings saved successfully');
    } catch (saveError: any) {
      console.error('Error saving settings:', saveError);
      setError(`Failed to save settings: ${saveError.message || String(saveError)}`);
    } finally {
      setIsSavingSettings(false);
    }
  };
  // --- END MODIFIED ---

  // Updated handleOpenLink to use Tauri context function
  const handleOpenLink = async (link: string | null | undefined) => {
    console.log('handleOpenLink called with link:', link);
    if (!link) return;
    
    let urlToOpen: string;
    if (link.startsWith('https://') || link.startsWith('http://')) {
      urlToOpen = link;
    } else if (link.startsWith('files_vc:')) {
      const code = link.replace('files_vc:', '');
      urlToOpen = `https://files.vc/d/${code}`; // Or the correct Files.vc URL structure
    } else {
      // Assume it's a Filemoon filecode if not a full URL or Files.vc link
      urlToOpen = `https://filemoon.sx/d/${link}`;
    }
    
    console.log(`Attempting to open link via Tauri: ${urlToOpen}`);
    try {
      await tauriOpenLink(urlToOpen); // Use the function from context
    } catch (err: any) {
        console.error('Error opening link via Tauri:', err);
        setError(`Could not open link: ${err.message || String(err)}`);
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

  // --- Settings Modal Component (MODIFIED) ---
  const SettingsModal = () => {
    // Modal-specific state for settings
    const [modalSettings, setModalSettings] = useState<AppSettings>(createEmptySettings());
    // Modal-specific state for the contribution checkbox - no longer needed
    const [isLoadingSettings, setIsLoadingSettings] = useState(true); 

    // Load initial values into modal state when modal opens
    useEffect(() => {
      setIsLoadingSettings(true);
      tauriGetAppSettings()
        .then(fetchedSettings => {
          setModalSettings(fetchedSettings || createEmptySettings());
        })
        .catch(err => {
          console.error("Error fetching settings for modal:", err);
        })
        .finally(() => {
          setIsLoadingSettings(false);
        });
    }, []); // Run only when modal mounts

    // Handle form submission in the modal
    const handleModalSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        // Prepare settings object
        const { 
          filemoon_api_key,
          files_vc_api_key,
          download_directory,
          delete_after_upload,
          auto_upload,
          upload_target
        } = modalSettings;
        
        const settingsToSave: AppSettings = {
          filemoon_api_key,
          files_vc_api_key,
          download_directory,
          delete_after_upload,
          auto_upload,
          upload_target
        };
        
        // Call the main save handler with just the settings
        handleSaveSettings(settingsToSave);
    }
    
    // Helper for input fields with optional highlight effect
    const renderInput = (id: string, label: string, placeholder: string, value: string | undefined, onChange: (val: string) => void, type = "text", helpText?: string) => {
      // Check if this is the API key field and if it should be highlighted
      const isApiKeyField = id === "filemoonApiKey";
      const shouldHighlight = isApiKeyField && missingApiKey;
      
      return (
        <div className={`mb-4 ${shouldHighlight ? 'animate-pulse' : ''}`}>
          <label htmlFor={id} className={`block text-sm font-medium ${shouldHighlight ? 'text-red-600 font-bold' : 'text-gray-700'} mb-1`}>
            {label} {shouldHighlight && '(Required)'}
          </label>
            <input
                id={id}
                type={type} 
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
              className={`mt-1 block w-full px-3 py-2 border ${shouldHighlight ? 'border-red-500 bg-red-50' : 'border-gray-300'} rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900`}
              autoFocus={shouldHighlight}
            />
          {helpText && <p className={`mt-1 text-xs ${shouldHighlight ? 'text-red-500 font-medium' : 'text-gray-500'}`}>{helpText}</p>}
          {shouldHighlight && (
            <p className="mt-1 text-xs text-red-600">This field is required for uploads. Please enter your Filemoon API key.</p>
          )}
        </div>
    );
    };
    
    // Helper for checkboxes
    const renderCheckbox = (id: string, label: string, checked: boolean, onChange: (checked: boolean) => void) => (
        <div className="mb-6 flex items-center">
            <input
                id={id}
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor={id} className="ml-3 block text-sm text-gray-900"> {/* Increased margin */}
                {label}
            </label>
        </div>
    );

    // Function to close modal and reset flags
    const handleCloseModal = () => {
      setShowSettingsModal(false);
      setMissingApiKey(false);
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white p-6 md:p-8 rounded-lg shadow-xl w-full max-w-lg transform transition-all sm:scale-100"> 
                <h2 className="text-xl font-semibold mb-6 text-gray-800">
                  {missingApiKey ? '⚠️ API Key Required for Uploads' : 'Application Settings'}
                </h2>
                
                {isLoadingSettings ? (
                   <div className="flex justify-center items-center h-40">
                     <p className="text-gray-600">Loading settings...</p> {/* Nicer loading */}
                   </div>
                ) : (
                  <form onSubmit={handleModalSubmit}>
                    {renderInput(
                      "filemoonApiKey", 
                      "Filemoon API Key", 
                      "Enter your Filemoon API Key", 
                      modalSettings.filemoon_api_key, 
                      (val) => setModalSettings(prev => ({ ...prev, filemoon_api_key: val })),
                      "text",
                      "Required for uploading videos to Filemoon"
                    )}
                    {/* Files.vc API input removed as requested */}
                    <div className="mb-2 p-2 bg-gray-50 border border-gray-200 rounded text-sm text-gray-700">
                      Files.vc integration is temporarily disabled in this version.
                    </div>
                    {renderInput(
                      "downloadDir", 
                      "Download Directory", 
                      "e.g., C:\\Users\\You\\Downloads\\PermaVid", 
                      modalSettings.download_directory, 
                      (val) => setModalSettings(prev => ({ ...prev, download_directory: val })),
                      "text",
                      "Leave blank to use system default download folder."
                    )}
                    
                    <div className="mb-4"> {/* Group checkboxes */}
                        {renderCheckbox(
                          "autoUpload", 
                          "Automatically upload after successful download", 
                          modalSettings.auto_upload === 'true', 
                          (checked) => setModalSettings(prev => ({ ...prev, auto_upload: checked ? 'true' : 'false' }))
                        )}
                        {renderCheckbox(
                          "deleteAfterUpload", 
                          "Delete local file after successful upload", 
                          modalSettings.delete_after_upload === 'true', 
                          (checked) => setModalSettings(prev => ({ ...prev, delete_after_upload: checked ? 'true' : 'false' }))
                        )}
                    </div>

                    <div className="mb-6">
                        <label htmlFor="uploadTarget" className="block text-sm font-medium text-gray-700 mb-1">Upload Target</label>
                        <select
                            id="uploadTarget"
                            value="filemoon"
                            onChange={(e) => setModalSettings(prev => ({ ...prev, upload_target: 'filemoon' }))}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-gray-900 bg-gray-100" // Slightly grayed out to show it's disabled
                            disabled={true}
                        >
                            <option value="filemoon">Filemoon Only</option>
                        </select>
                        <p className="mt-1 text-xs text-gray-500">Currently only Filemoon uploads are supported.</p>
                    </div>
                    
                    {/* Action buttons (submit now triggers handleModalSubmit) */}
                    <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={handleCloseModal}
                            disabled={isSavingSettings}
                            className="py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSavingSettings}
                            className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors flex items-center"
                        >
                            {isSavingSettings ? (
                               <>
                                 <Cog6ToothIcon className="h-4 w-4 mr-2 animate-spin" /> Saving...
                               </>
                             ) : 'Save Settings'}
                        </button>
                    </div>
                  </form>
                )}
            </div>
        </div>
    );
  }
  
  // Helper for Dropdown Menu Items
  const DropdownItem = ({ onClick, children, isActive = false }: { onClick: () => void; children: React.ReactNode; isActive?: boolean }) => (
    <button
      onClick={onClick}
      className={`block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 ${isActive ? 'font-semibold bg-gray-100' : ''}`}
      role="menuitem"
    >
      {children}
    </button>
  );

  // New component for creating consistent dropdown menus
  const DropdownMenu = ({ 
    isOpen, 
    onClose, 
    children,
    alignment = 'right' 
  }: { 
    isOpen: boolean;
    onClose: () => void; 
    children: React.ReactNode;
    alignment?: 'right' | 'left';
  }) => {
    if (!isOpen) return null;
    
    return (
      <div 
        className={`absolute ${alignment === 'right' ? 'right-0' : 'left-0'} mt-2 w-56 rounded-md shadow-2xl bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none border border-gray-200 dark:border-gray-700`}
        style={{ 
          position: 'absolute',
          top: '100%',
          maxHeight: '80vh', // Use viewport height to avoid being cut off
          overflowY: 'auto',
          zIndex: 50,
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="py-1" role="menu" aria-orientation="vertical">
          {children}
        </div>
      </div>
    );
  };

  return (
     <main className="flex min-h-screen flex-col items-center p-4 sm:p-6 md:p-8 bg-gray-50 dark:bg-gray-900">
       <div className="w-full max-w-6xl flex justify-between items-center mb-6">
         <h1 className="text-2xl font-bold text-gray-900 dark:text-white">PermaVid</h1>
         <div className="flex items-center space-x-4">
           <Link 
             href="/archives" 
             className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
           >
             Archives
           </Link>
           <button
             onClick={() => setShowSettingsModal(true)}
             className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
           >
             Settings
           </button>
           <UserProfile />
         </div>
       </div>

      <div className="w-full max-w-6xl"> {/* Use max-w-6xl for wider content */}
        {/* Input Form Section */}
        <form onSubmit={handleSubmit} className="w-full bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 mb-8">
          <label htmlFor="urlInput" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Add Video URL to Archive:
          </label>
          <div className="flex space-x-3 mt-1">
            <input
              id="urlInput"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              required
              className="flex-grow block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <button
              type="submit"
              disabled={isLoading || !url}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
               {isLoading ? (
                 <>
                   <Cog6ToothIcon className="h-4 w-4 mr-2 animate-spin" /> Adding...
                 </>
                ) : (
                 <>
                   <PlusIcon className="h-4 w-4 mr-1" /> Add URL
                 </>
                )}
            </button>
          </div>
        </form>

        {/* Message/Error Area */}
        {(message || error) && (
          <div className={`p-3 rounded-md mb-6 text-sm ${
             error 
               ? 'bg-red-50 border border-red-200 text-red-700' 
               : 'bg-green-50 border border-green-200 text-green-700'
             }`}
           >
             {error || message}
           </div>
        )}

        {/* Queue List Section - completely restructured for proper dropdown handling */}
        <div className="w-full bg-white dark:bg-gray-800 shadow-md sm:rounded-lg" style={{ overflow: 'visible' }}>
          {/* Queue Header & Controls */}
          <div className="px-4 py-3 sm:px-6 border-b border-gray-200 dark:border-gray-700 flex flex-wrap justify-between items-center gap-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Archive Queue ({displayedQueueItems.length} item{displayedQueueItems.length !== 1 ? 's' : ''})
            </h2>

            {/* Control buttons with dropdowns */}
            <div className="flex flex-wrap items-center gap-3 relative" style={{ zIndex: 40 }}>
              {/* Refresh Button */}
              <button
                onClick={() => {
                  fetchQueue();
                  setMessage('Queue refreshed');
                  setTimeout(() => setMessage(''), 2000); // Clear message after 2 seconds
                }}
                disabled={isRefreshing}
                className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center space-x-1 disabled:opacity-50"
                title="Refresh Queue"
              >
                <ArrowPathRoundedSquareIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}/>
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
              
              {/* Filter Dropdown - completely rebuilt with proper positioning */}
              <div className="relative inline-block" style={{ position: 'relative' }}>
                <button
                  ref={filterButtonRef}
                  onClick={() => {
                    setShowFilterDropdown(!showFilterDropdown);
                    setShowSortDropdown(false);
                    setShowClearDropdown(false);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center space-x-1"
                >
                  <AdjustmentsHorizontalIcon className="h-4 w-4"/>
                  <span>Filter: <span className="capitalize font-semibold">{filterStatus}</span></span>
                  <ChevronDownIcon className="h-3 w-3 ml-1" />
                </button>
                
                {showFilterDropdown && (
                  <DropdownMenu 
                    isOpen={showFilterDropdown} 
                    onClose={() => setShowFilterDropdown(false)} 
                  >
                    {(['all', 'queued', 'downloading', 'completed', 'uploading', 'transferring', 'encoding', 'encoded', 'failed', 'cancelled'] as FilterStatus[]).map(status => (
                      <DropdownItem
                        key={status}
                        onClick={() => { 
                          setFilterStatus(status); 
                          setShowFilterDropdown(false); 
                        }}
                        isActive={filterStatus === status}
                      >
                        <div className="flex items-center">
                          {icons[status] || <span className="w-4 h-4 mr-1.5"></span>}
                          <span className="capitalize">{status}</span>
                        </div>
                      </DropdownItem>
                    ))}
                  </DropdownMenu>
                )}
              </div>

              {/* Sort Dropdown - completely rebuilt with proper positioning */}
              <div className="relative inline-block" style={{ position: 'relative' }}>
                <button
                  ref={sortButtonRef}
                  onClick={() => {
                    setShowSortDropdown(!showSortDropdown);
                    setShowFilterDropdown(false);
                    setShowClearDropdown(false);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center space-x-1"
                >
                  <ArrowsUpDownIcon className="h-4 w-4"/>
                  <span>Sort</span>
                  <ChevronDownIcon className="h-3 w-3 ml-1" />
                </button>
                
                {showSortDropdown && (
                  <DropdownMenu 
                    isOpen={showSortDropdown} 
                    onClose={() => setShowSortDropdown(false)} 
                  >
                    <DropdownItem onClick={() => { setSortKey('added_at_desc'); setShowSortDropdown(false); }} isActive={sortKey === 'added_at_desc'}>
                      Added (Newest)
                    </DropdownItem>
                    <DropdownItem onClick={() => { setSortKey('added_at_asc'); setShowSortDropdown(false); }} isActive={sortKey === 'added_at_asc'}>
                      Added (Oldest)
                    </DropdownItem>
                    <DropdownItem onClick={() => { setSortKey('title_asc'); setShowSortDropdown(false); }} isActive={sortKey === 'title_asc'}>
                      Title (A-Z)
                    </DropdownItem>
                    <DropdownItem onClick={() => { setSortKey('title_desc'); setShowSortDropdown(false); }} isActive={sortKey === 'title_desc'}>
                      Title (Z-A)
                    </DropdownItem>
                    <DropdownItem onClick={() => { setSortKey('status'); setShowSortDropdown(false); }} isActive={sortKey === 'status'}>
                      Status
                    </DropdownItem>
                  </DropdownMenu>
                )}
              </div>

              {/* Clear Dropdown - completely rebuilt with proper positioning */}
              <div className="relative inline-block" style={{ position: 'relative' }}>
                <button
                  ref={clearButtonRef}
                  onClick={() => {
                    setShowClearDropdown(!showClearDropdown);
                    setShowFilterDropdown(false);
                    setShowSortDropdown(false);
                  }}
                  disabled={isClearing}
                  className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center space-x-1"
                >
                  <TrashIcon className="h-4 w-4"/>
                  <span>Clear</span>
                  <ChevronDownIcon className="h-3 w-3 ml-1" />
                </button>
                
                {showClearDropdown && (
                  <DropdownMenu 
                    isOpen={showClearDropdown} 
                    onClose={() => setShowClearDropdown(false)} 
                  >
                    <DropdownItem onClick={() => handleClearQueue('completed')}>
                      Clear Downloaded
                    </DropdownItem>
                    <DropdownItem onClick={() => handleClearQueue('encoded')}>
                      Clear Encoded
                    </DropdownItem>
                    <DropdownItem onClick={() => handleClearQueue('failed')}>
                      Clear Failed
                    </DropdownItem>
                    <DropdownItem onClick={() => handleClearQueue('cancelled')}>
                      Clear Cancelled
                    </DropdownItem>
                    <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>
                    <DropdownItem onClick={() => handleClearQueue('all_finished')}>
                      <span className="text-red-600 font-medium">Clear All Finished</span>
                    </DropdownItem>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>

          {/* Queue List - with proper z-index handling */}
          <div className="relative" style={{ overflow: 'visible' }}>
            <ul role="list" className="divide-y divide-gray-200 dark:divide-gray-700">
              {contextQueue.length === 0 ? (
                <li className="px-4 py-10 sm:px-6 text-center text-gray-500 dark:text-gray-400">
                  The queue is empty. Add a URL above to get started!
                </li>
              ) : displayedQueueItems.length === 0 ? (
                <li className="px-4 py-10 sm:px-6 text-center text-gray-500 dark:text-gray-400">
                  No items match the current filter (<span className="capitalize font-medium">{filterStatus}</span>).
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
