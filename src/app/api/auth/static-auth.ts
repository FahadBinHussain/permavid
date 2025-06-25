// Static authentication module for Tauri environment

import { open } from '@tauri-apps/api/shell';
// Import necessary modules for window creation
import { WebviewWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';

/**
 * Real authentication functions that work with static exports
 * This uses OAuth flow in a Tauri-friendly way
 */

export interface User {
  id: string;
  name?: string;
  email?: string;
  image?: string | null;
}

export interface StaticAuthResponse {
  success: boolean;
  user?: User;
  error?: string;
}

// Storage key for consistency
const AUTH_STORAGE_KEY = 'auth_user';

// Detect Tauri environment
const isTauri = typeof window !== 'undefined' && 
               ((window as any).__TAURI__ !== undefined || 
               (typeof navigator !== 'undefined' && navigator.userAgent.includes('Tauri')));

// Google OAuth configuration - these values would be loaded from environment
// The client ID should match what's in your .env.local file
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 
                        '984437890797-v4niohbejo402et684ij47qie0a45rue.apps.googleusercontent.com';
const GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/callback';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USER_INFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/**
 * Real Google authentication using browser window
 */
export async function staticSignIn(provider = 'google'): Promise<StaticAuthResponse> {
  try {
    console.log('Starting authentication with provider:', provider);
    
    if (provider !== 'google') {
      throw new Error(`Provider ${provider} not supported`);
    }

    // Generate a random state to prevent CSRF attacks
    const state = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('oauth_state', state);
    console.log('OAuth state set:', state);

    // Construct the OAuth URL
    const scope = encodeURIComponent('profile email');
    const authUrl = `${GOOGLE_AUTH_URL}?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&response_type=token&scope=${scope}&state=${state}&prompt=consent`;
    
    console.log('Auth URL created, opening window for:', GOOGLE_REDIRECT_URI);

    // Open the OAuth URL in a window 
    let authWindow: Window | null = null;
    let tauriAuthWindow: WebviewWindow | null = null;
    
    if (isTauri) {
      console.log('Using Tauri WebviewWindow for authentication');
      try {
        // Create a new window using Tauri's WebviewWindow API
        tauriAuthWindow = new WebviewWindow('oauth-window', {
          url: authUrl,
          title: 'Sign in',
          width: 600,
          height: 700,
          center: true,
          resizable: true
        });
        
        // Listen for window closure
        tauriAuthWindow.once('tauri://error', (e) => {
          console.error('Auth window error:', e);
        });
      } catch (e) {
        console.error('Failed to create auth window:', e);
        return {
          success: false,
          error: 'Failed to create authentication window'
        };
      }
    } else {
      // Fallback for regular browser
      console.log('Opening popup window');
      authWindow = window.open(authUrl, '_blank', 'width=600,height=700');
      if (!authWindow) {
        console.error('Failed to open popup window - may be blocked by browser');
        return {
          success: false,
          error: 'Failed to open authentication window. Please allow popups for this site.'
        };
      }
    }

    // Listen for the redirect with the access token
    return new Promise((resolve) => {
      console.log('Setting up message listeners');
      
      // Set up Tauri-specific event listener if in Tauri
      let tauriUnlisten: (() => void) | null = null;
      
      if (isTauri) {
        console.log('Setting up Tauri event listener');
        
        // Listen for the OAUTH_CALLBACK event from the auth window
        listen('OAUTH_CALLBACK', (event) => {
          console.log('Received Tauri OAUTH_CALLBACK event:', event);
          
          const data = event.payload as any;
          const token = data?.token;
          const error = data?.error;
          
          if (tauriUnlisten) {
            tauriUnlisten();
          }
          
          if (error || !token) {
            console.error('Authentication error via Tauri event:', error);
            resolve({
              success: false,
              error: error || 'Authentication failed'
            });
            return;
          }
          
          // Process user info as before
          console.log('Token received via Tauri event, fetching user info');
          
          fetch(GOOGLE_USER_INFO_URL, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          .then(response => {
            if (!response.ok) {
              throw new Error(`User info request failed: ${response.status}`);
            }
            return response.json();
          })
          .then(userInfo => {
            console.log('User info received:', userInfo.email);
            
            const user: User = {
              id: userInfo.sub,
              name: userInfo.name,
              email: userInfo.email,
              image: userInfo.picture
            };
            
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
            
            resolve({
              success: true,
              user
            });
          })
          .catch(error => {
            console.error('Error fetching user info:', error);
            resolve({
              success: false,
              error: error.message
            });
          });
        }).then(unlisten => {
          tauriUnlisten = unlisten;
        }).catch(err => {
          console.error('Error setting up Tauri event listener:', err);
        });
      }
      
      // Standard browser message listener 
      const messageHandler = (event: MessageEvent) => {
        console.log('Message received:', event.origin, event.data?.type);
        
        // Check if the message is from our expected origin and has the right format
        if (event.origin === window.location.origin && event.data.type === 'OAUTH_CALLBACK') {
          console.log('Valid callback message received');
          
          // Remove the event listener
          window.removeEventListener('message', messageHandler);
          
          // Clean up Tauri listener if it exists
          if (tauriUnlisten) {
            tauriUnlisten();
          }
          
          const { token, error } = event.data;
          
          if (error || !token) {
            console.error('Authentication error:', error);
            resolve({
              success: false,
              error: error || 'Authentication failed'
            });
            return;
          }
          
          console.log('Token received, fetching user info');
          
          // Get user info using the access token
          fetch(GOOGLE_USER_INFO_URL, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          .then(response => {
            if (!response.ok) {
              throw new Error(`User info request failed: ${response.status}`);
            }
            return response.json();
          })
          .then(userInfo => {
            console.log('User info received:', userInfo.email);
            
            // Create a user object from the Google user info
            const user: User = {
              id: userInfo.sub,
              name: userInfo.name,
              email: userInfo.email,
              image: userInfo.picture
            };
            
            // Store the user in localStorage
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
            
            resolve({
              success: true,
              user
            });
          })
          .catch(error => {
            console.error('Error fetching user info:', error);
            resolve({
              success: false,
              error: error.message
            });
          });
        }
      };
      
      // Add event listener for the OAuth callback message
      window.addEventListener('message', messageHandler);
      
      // Attempt to periodically check if popup was closed without auth completion
      let checkClosedInterval: ReturnType<typeof setInterval> | null = null;
      
      if (!isTauri && authWindow) {
        checkClosedInterval = setInterval(() => {
          if (authWindow && authWindow.closed) {
            console.log('Auth window was closed');
            if (checkClosedInterval !== null) {
              clearInterval(checkClosedInterval);
            }
            window.removeEventListener('message', messageHandler);
            resolve({
              success: false,
              error: 'Authentication window was closed'
            });
          }
        }, 1000);
      }
      
      // Set a timeout to reject the promise after 5 minutes
      const timeoutId = setTimeout(() => {
        console.error('Authentication timed out after 5 minutes');
        window.removeEventListener('message', messageHandler);
        if (checkClosedInterval !== null) {
          clearInterval(checkClosedInterval);
        }
        if (tauriUnlisten) {
          tauriUnlisten();
        }
        resolve({
          success: false,
          error: 'Authentication timed out'
        });
      }, 5 * 60 * 1000);
    });
  } catch (error) {
    console.error('Static sign-in error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function staticSignOut(): Promise<StaticAuthResponse> {
  try {
    // Clear all auth-related items from storage
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem('oauth_state');
    localStorage.removeItem('oauth_token');
    
    // Clear any session storage that might be used
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    
    // Attempt to clear extra next-auth session data that might be present
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('next-auth') || key.includes('session') || key.includes('oauth'))) {
          keysToRemove.push(key);
        }
      }
      
      // Remove the collected keys
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (e) {
      console.error('Error cleaning up additional storage items:', e);
    }
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const userData = localStorage.getItem(AUTH_STORAGE_KEY);
    if (userData) {
      return JSON.parse(userData);
    }
    return null;
  } catch (e) {
    console.error('Error getting current user:', e);
    return null;
  }
} 