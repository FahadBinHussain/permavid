'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import { staticSignIn, staticSignOut, getCurrentUser, User } from './api/auth/static-auth';

// Check if we're in a Tauri environment
const isTauri = typeof window !== 'undefined' && 
                ((window as any).__TAURI__ !== undefined || 
                (typeof navigator !== 'undefined' && navigator.userAgent.includes('Tauri')));

// Create a context for our custom auth state
interface AuthContextType {
  user: User | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  error: string | null;
  signIn: (provider?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  status: 'loading',
  error: null,
  signIn: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// This provider will manage auth state and provide it to children
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [error, setError] = useState<string | null>(null);

  // Init auth state from local storage on first load
  useEffect(() => {
    try {
      console.log('AuthProvider: Initializing auth state');
      const savedUser = getCurrentUser();
      if (savedUser) {
        console.log('AuthProvider: Found saved user', savedUser.email);
        setUser(savedUser);
        setStatus('authenticated');
      } else {
        console.log('AuthProvider: No saved user found');
        setStatus('unauthenticated');
      }
    } catch (e) {
      console.error('Error loading auth from storage:', e);
      setStatus('unauthenticated');
      setError('Failed to load authentication state');
    }
  }, []);

  // Custom sign-in function that works with static exports
  const handleSignIn = async (provider = 'google') => {
    try {
      console.log(`AuthProvider: Starting sign-in with ${provider}`);
      setStatus('loading');
      setError(null);
      
      const result = await staticSignIn(provider);
      console.log('AuthProvider: Sign-in result', { success: result.success, hasUser: !!result.user });
      
      if (result.success && result.user) {
        setUser(result.user);
        setStatus('authenticated');
      } else {
        throw new Error(result.error || 'Sign in failed');
      }
    } catch (error) {
      console.error('AuthProvider: Sign-in error:', error);
      setStatus('unauthenticated');
      setError(error instanceof Error ? error.message : 'Authentication failed');
      
      // Display a message to the user
      if (typeof window !== 'undefined') {
        alert(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
      }
    }
  };

  // Custom sign-out function
  const handleSignOut = async () => {
    try {
      console.log('AuthProvider: Starting sign-out');
      // First update the state
      setStatus('loading'); // Prevent immediate redirects
      
      // Clean up localStorage
      const result = await staticSignOut();
      console.log('AuthProvider: Sign-out result', result);
      
      // Give the browser a small delay to process localStorage changes
      // This helps prevent race conditions with the AuthGuard component
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Finally update React state
      setUser(null);
      setStatus('unauthenticated');
      setError(null);
      
      // Force a full page refresh to clear any lingering state
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/signin';
      }
    } catch (error) {
      console.error('AuthProvider: Sign-out error:', error);
      // Reset to unauthenticated state even on error
      setUser(null);
      setStatus('unauthenticated');
      setError('Failed to sign out properly');
    }
  };

  // Provide auth state to all children
  return (
    <AuthContext.Provider value={{ 
      user, 
      status, 
      error,
      signIn: handleSignIn,
      signOut: handleSignOut
    }}>
      {/* If not in Tauri, also provide NextAuth's SessionProvider for web mode */}
      {!isTauri ? (
        <SessionProvider>{children}</SessionProvider>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
} 