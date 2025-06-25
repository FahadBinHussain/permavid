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
  signIn: (provider?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  status: 'loading',
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

  // Init auth state from local storage on first load
  useEffect(() => {
    try {
      const savedUser = getCurrentUser();
      if (savedUser) {
        setUser(savedUser);
        setStatus('authenticated');
      } else {
        setStatus('unauthenticated');
      }
    } catch (e) {
      console.error('Error loading auth from storage:', e);
      setStatus('unauthenticated');
    }
  }, []);

  // Custom sign-in function that works with static exports
  const handleSignIn = async (provider = 'google') => {
    try {
      setStatus('loading');
      const result = await staticSignIn(provider);
      
      if (result.success && result.user) {
        setUser(result.user);
        setStatus('authenticated');
      } else {
        throw new Error(result.error || 'Sign in failed');
      }
    } catch (error) {
      console.error('Sign-in error:', error);
      setStatus('unauthenticated');
    }
  };

  // Custom sign-out function
  const handleSignOut = async () => {
    try {
      // First update the state
      setStatus('loading'); // Prevent immediate redirects
      
      // Clean up localStorage
      await staticSignOut();
      
      // Give the browser a small delay to process localStorage changes
      // This helps prevent race conditions with the AuthGuard component
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Finally update React state
      setUser(null);
      setStatus('unauthenticated');
      
      // Force a full page refresh to clear any lingering state
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/signin';
      }
    } catch (error) {
      console.error('Sign-out error:', error);
      // Reset to unauthenticated state even on error
      setUser(null);
      setStatus('unauthenticated');
    }
  };

  // Provide auth state to all children
  return (
    <AuthContext.Provider value={{ 
      user, 
      status, 
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