// Check if we're running in a Tauri context
export const isTauri = () => {
  return window.__TAURI__ !== undefined;
};

// Interface for video objects
export interface Video {
  id?: number;
  title: string;
  url: string;
  local_path?: string | null;
  thumbnail?: string | null;
  status: string;
  created_at?: string;
}

// Function to open links in the default browser
export const openExternalLink = async (url: string): Promise<void> => {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api');
      await invoke('open_external_link', { url });
    } catch (error) {
      console.error('Failed to open link via Tauri:', error);
      // Fallback to regular window.open
      window.open(url, '_blank');
    }
  } else if (window.electronAPI) {
    // Fallback to Electron if available
    try {
      await window.electronAPI.openExternalLink(url);
    } catch (error) {
      console.error('Failed to open link via Electron:', error);
      window.open(url, '_blank');
    }
  } else {
    // Default behavior
    window.open(url, '_blank');
  }
};

// Function to get all videos
export const getVideos = async (): Promise<Video[]> => {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api');
      const response = await invoke('get_videos');
      return handleResponse(response);
    } catch (error) {
      console.error('Failed to get videos via Tauri:', error);
      throw error;
    }
  } else {
    // Fallback to REST API for non-Tauri environments
    const response = await fetch('/api/videos');
    const data = await response.json();
    return data.data || [];
  }
};

// Function to add a video
export const addVideo = async (video: Video): Promise<void> => {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api');
      const response = await invoke('add_video', { video });
      return handleResponse(response);
    } catch (error) {
      console.error('Failed to add video via Tauri:', error);
      throw error;
    }
  } else {
    // Fallback to REST API for non-Tauri environments
    const response = await fetch('/api/videos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(video),
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message);
    }
  }
};

// Function to update video status
export const updateVideoStatus = async (id: number, status: string): Promise<void> => {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api');
      const response = await invoke('update_video_status', { id, status });
      return handleResponse(response);
    } catch (error) {
      console.error('Failed to update video status via Tauri:', error);
      throw error;
    }
  } else {
    // Fallback to REST API for non-Tauri environments
    const response = await fetch(`/api/videos/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message);
    }
  }
};

// Function to update video path
export const updateVideoPath = async (id: number, path: string): Promise<void> => {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api');
      const response = await invoke('update_video_path', { id, path });
      return handleResponse(response);
    } catch (error) {
      console.error('Failed to update video path via Tauri:', error);
      throw error;
    }
  } else {
    // Fallback to REST API for non-Tauri environments
    const response = await fetch(`/api/videos/${id}/path`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path }),
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message);
    }
  }
};

// Helper function to handle Tauri responses
function handleResponse(response: any) {
  if (!response.success) {
    throw new Error(response.message || 'Unknown error');
  }
  return response.data;
}

// Add TypeScript declaration for Electron API in window object
declare global {
  interface Window {
    electronAPI?: {
      openExternalLink: (url: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
} 