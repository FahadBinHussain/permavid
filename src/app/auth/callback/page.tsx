'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function AuthCallback() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Extract credentials from URL
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    const error = params.get('error');
    const state = params.get('state');

    // Validate state to prevent CSRF attacks
    const storedState = localStorage.getItem('oauth_state');

    if (state && storedState && state === storedState) {
      // Clear the state from localStorage
      localStorage.removeItem('oauth_state');

      if (token) {
        // Store token in localStorage
        localStorage.setItem('oauth_token', token);

        // Send a message to the opener with the token
        if (window.opener) {
          window.opener.postMessage({
            type: 'OAUTH_CALLBACK',
            token,
          }, window.location.origin);
        }
      } else if (error) {
        if (window.opener) {
          window.opener.postMessage({
            type: 'OAUTH_CALLBACK',
            error,
          }, window.location.origin);
        }
      }
    } else {
      // State doesn't match, potential CSRF attack
      if (window.opener) {
        window.opener.postMessage({
          type: 'OAUTH_CALLBACK',
          error: 'Invalid state parameter. Possible CSRF attack.',
        }, window.location.origin);
      }
    }

    // Close this window after a short delay
    setTimeout(() => {
      window.close();
    }, 1000);
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