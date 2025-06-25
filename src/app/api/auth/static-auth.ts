// Static authentication module for Tauri environment

/**
 * Basic authentication functions that work in a static export
 * This uses localStorage instead of server-side authentication
 * to be compatible with Tauri's static export requirements
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

// Mock authentication - in a real app, integrate with Tauri for proper auth
export async function staticSignIn(provider = 'google'): Promise<StaticAuthResponse> {
  try {
    // Create a mock user - in a real app, this would connect to OAuth API
    const mockUser: User = {
      id: 'user_' + Math.random().toString(36).substring(2, 9),
      name: 'Tauri User',
      email: 'user@example.com',
      image: null,
    };
    
    // Store in localStorage
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mockUser));
    
    return {
      success: true,
      user: mockUser
    };
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
    
    // Clear any session storage that might be used
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    
    // Attempt to clear extra next-auth session data that might be present
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('next-auth') || key.includes('session'))) {
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