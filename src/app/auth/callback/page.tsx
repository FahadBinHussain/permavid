'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

// Check if we're in a Tauri environment - safely for SSR
const isTauri = typeof window !== 'undefined' && 
               ((window as any).__TAURI__ !== undefined || 
               (typeof navigator !== 'undefined' && navigator.userAgent.includes('Tauri')));

export default function AuthCallback() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Extract credentials from URL
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash || window.location.search.substring(1));
    const token = params.get('access_token');
    const error = params.get('error');
    const state = params.get('state');

    // For debugging
    console.log('Auth callback received:', { hash, token: !!token, error, state });

    // Validate state to prevent CSRF attacks
    const storedState = localStorage.getItem('oauth_state');
    console.log('Stored state exists:', !!storedState);

    if (state && storedState && state === storedState) {
      // Clear the state from localStorage
      localStorage.removeItem('oauth_state');
      console.log('State validated successfully');

      if (token) {
        // Store token in localStorage
        localStorage.setItem('oauth_token', token);

        // Different behavior depending on environment
        if (isTauri) {
          console.log('In Tauri environment, sending message to main window');
          
          // In Tauri, we need to send the message to the main window
          (async () => {
            try {
              // Use window.opener if available (works in some Tauri setups)
              if (window.opener) {
                window.opener.postMessage({
                  type: 'OAUTH_CALLBACK',
                  token,
                }, window.location.origin);
                console.log('Sent token via window.opener');
              }
              
              // Also try to send via WebviewWindow API
              if ((window as any).__TAURI__?.window) {
                // Dynamically import Tauri API
                const { WebviewWindow } = (window as any).__TAURI__.window;
                const mainWindow = WebviewWindow.getByLabel('main');
                
                if (mainWindow) {
                  mainWindow.emit('OAUTH_CALLBACK', { 
                    type: 'OAUTH_CALLBACK',
                    token
                  });
                  console.log('Sent token via Tauri WebviewWindow emit');
                }
              }
              
              // Try to close this window after sending
              setTimeout(() => {
                if ((window as any).__TAURI__?.window) {
                  const { getCurrent } = (window as any).__TAURI__.window;
                  const currentWindow = getCurrent();
                  if (currentWindow) {
                    currentWindow.close();
                  }
                }
                // Fallback if window didn't close
                setTimeout(() => {
                  window.location.href = '/';
                }, 500);
              }, 1000);
            } catch (e) {
              console.error('Error in Tauri auth callback:', e);
              window.location.href = '/';
            }
          })();
        } else if (window.opener) {
          // Standard browser popup flow
          console.log('Sending success message to opener');
          window.opener.postMessage({
            type: 'OAUTH_CALLBACK',
            token,
          }, window.location.origin);
          
          // Ensure the message was sent
          setTimeout(() => {
            console.log('Closing callback window after sending token');
            window.close();
            // If window didn't close, redirect to main app
            setTimeout(() => {
              window.location.href = '/';
            }, 500);
          }, 1000);
        } else {
          console.error('No window.opener found!');
          // Redirect to home page if there's no opener
          window.location.href = '/';
        }
      } else if (error) {
        if (isTauri) {
          (async () => {
            try {
              // Try to notify main window about error
              if ((window as any).__TAURI__?.window) {
                // Dynamically import Tauri API
                const { WebviewWindow } = (window as any).__TAURI__.window;
                const mainWindow = WebviewWindow.getByLabel('main');
                
                if (mainWindow) {
                  mainWindow.emit('OAUTH_CALLBACK', { 
                    type: 'OAUTH_CALLBACK',
                    error
                  });
                }
              }
              
              // Close auth window
              setTimeout(() => {
                try {
                  if ((window as any).__TAURI__?.window) {
                    const { getCurrent } = (window as any).__TAURI__.window;
                    const currentWindow = getCurrent();
                    if (currentWindow) {
                      currentWindow.close();
                    }
                  }
                } catch (e) {
                  console.error('Error closing Tauri window:', e);
                }
                
                // Fallback redirect
                window.location.href = '/auth/signin';
              }, 1000);
            } catch (e) {
              console.error('Error in Tauri auth error handling:', e);
              window.location.href = '/auth/signin';
            }
          })();
        } else if (window.opener) {
          console.log('Sending error message to opener:', error);
          window.opener.postMessage({
            type: 'OAUTH_CALLBACK',
            error,
          }, window.location.origin);
          
          setTimeout(() => {
            window.close();
            // If window didn't close, redirect to sign in
            setTimeout(() => {
              window.location.href = '/auth/signin';
            }, 500);
          }, 1000);
        } else {
          console.error('No window.opener found with error!');
          // Redirect to sign in page if there's no opener
          window.location.href = '/auth/signin';
        }
      }
    } else {
      // State doesn't match, potential CSRF attack
      console.error('Invalid state:', { received: state, stored: storedState });
      
      if (window.opener) {
        window.opener.postMessage({
          type: 'OAUTH_CALLBACK',
          error: 'Invalid state parameter. Possible CSRF attack.',
        }, window.location.origin);
        
        setTimeout(() => {
          window.close();
          // If window didn't close, redirect to sign in
          setTimeout(() => {
            window.location.href = '/auth/signin';
          }, 500);
        }, 1000);
      } else {
        // Redirect to sign in page if there's no opener
        window.location.href = '/auth/signin';
      }
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Authentication in progress...</h1>
        <div className="animate-spin h-10 w-10 border-4 border-indigo-600 rounded-full border-t-transparent mx-auto"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">
          Please wait while we complete your authentication.
          <br />
          This window will close automatically.
        </p>
      </div>
    </div>
  );
} 