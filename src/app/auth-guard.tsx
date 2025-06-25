'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useAuth } from './auth-provider';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAuthPath = pathname.startsWith('/auth');
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    // Reset hasRedirected on pathname change to ensure redirects work
    // when navigating between protected and unprotected routes
    if (pathname) {
      setHasRedirected(false);
    }
  }, [pathname]);

  useEffect(() => {
    // Only handle redirects if we're not already redirecting and not loading
    if (status === 'loading' || hasRedirected) {
      return;
    }

    // Determine if redirect is needed
    if (!user && !isAuthPath) {
      // Redirect to signin page if not authenticated
      setRedirectUrl('/auth/signin');
      setHasRedirected(true);
    } else if (user && isAuthPath) {
      // Redirect to home if authenticated but on auth page
      setRedirectUrl('/');
      setHasRedirected(true);
    }
  }, [user, status, isAuthPath, hasRedirected]);

  // Handle actual navigation when redirectUrl is set
  useEffect(() => {
    if (redirectUrl) {
      router.push(redirectUrl);
    }
  }, [redirectUrl, router]);

  // Loading state
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin h-10 w-10 border-4 border-indigo-600 rounded-full border-t-transparent"></div>
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  // Render children based on auth state
  if ((user && !isAuthPath) || (!user && isAuthPath)) {
    return <>{children}</>;
  }

  // Show redirecting state
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="animate-spin h-10 w-10 border-4 border-indigo-600 rounded-full border-t-transparent"></div>
        <p className="text-lg">Redirecting...</p>
      </div>
    </div>
  );
} 