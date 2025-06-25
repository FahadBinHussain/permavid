// Static authentication module for Tauri environment

import { open } from '@tauri-apps/api/shell';

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
    if (provider !== 'google') {
      throw new Error(`Provider ${provider} not supported`);
    }

    // Generate a random state to prevent CSRF attacks
    const state = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('oauth_state', state);

    // Construct the OAuth URL
    const scope = encodeURIComponent('profile email');
    const authUrl = `${GOOGLE_AUTH_URL}?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&response_type=token&scope=${scope}&state=${state}&prompt=consent`;

    // Open the OAuth URL in a browser window 
    if (isTauri) {
      // Use Tauri's shell.open for Tauri app
      await open(authUrl);
    } else {
      // Fallback for regular browser
      window.open(authUrl, '_blank', 'width=600,height=700');
    }

    // Listen for the redirect with the access token
    return new Promise((resolve) => {
      const messageHandler = (event: MessageEvent) => {
        // Check if the message is from our expected origin and has the right format
        if (event.origin === window.location.origin && event.data.type === 'OAUTH_CALLBACK') {
          // Remove the event listener
          window.removeEventListener('message', messageHandler);
          
          const { token, error } = event.data;
          
          if (error || !token) {
            resolve({
              success: false,
              error: error || 'Authentication failed'
            });
            return;
          }
          
          // Get user info using the access token
          fetch(GOOGLE_USER_INFO_URL, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          })
          .then(response => response.json())
          .then(userInfo => {
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
            resolve({
              success: false,
              error: error.message
            });
          });
        }
      };
      
      // Add event listener for the OAuth callback message
      window.addEventListener('message', messageHandler);
      
      // Set a timeout to reject the promise after 5 minutes
      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        resolve({
          success: false,
          error: 'Authentication timed out'
        });
      }, 5 * 60 * 1000);
    });
  } catch (error) {
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