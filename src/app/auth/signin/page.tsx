"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "../../auth-provider";

export default function SignIn() {
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const router = useRouter();
  const { user, status, error: authError, signIn } = useAuth();

  // Use either local error or auth context error
  const error = localError || authError;

  // If already authenticated, redirect to home
  useEffect(() => {
    if (status !== "loading" && user) {
      router.push("/");
    }
  }, [user, status, router]);

  // Reset loading state when auth status changes
  useEffect(() => {
    if (status !== "loading") {
      setIsLoading(false);
    }
  }, [status]);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setLocalError(null);
      console.log("SignIn: Starting Google sign-in process");
      signIn();
    } catch (error) {
      console.error("SignIn: Error signing in with Google:", error);
      setLocalError(
        error instanceof Error ? error.message : "Authentication failed",
      );
      setIsLoading(false);
    }
  };

  // Don't render anything if already authenticated and redirecting
  if (status === "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin h-10 w-10 border-4 border-indigo-600 rounded-full border-t-transparent"></div>
          <p className="text-lg">Already signed in, redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-md p-8 space-y-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome to PermaVid
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Sign in with your Google account
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-3 rounded-md text-sm mb-4">
            <p className="font-medium">Authentication error</p>
            <p>{error}</p>
            <p className="text-xs mt-1">
              Please try again or refresh the page.
            </p>
          </div>
        )}

        {status === "loading" && !isLoading && (
          <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 p-3 rounded-md text-sm mb-4">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 dark:border-blue-400 mr-2"></div>
              <span>Checking authentication status...</span>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading || status === "loading"}
            className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 dark:border-gray-300 mr-2"></div>
                <span>Connecting to Google...</span>
              </div>
            ) : (
              <>
                <svg
                  className="w-5 h-5 mr-3"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                    <path
                      fill="#4285F4"
                      d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"
                    />
                    <path
                      fill="#34A853"
                      d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"
                    />
                  </g>
                </svg>
                Sign in with Google
              </>
            )}
          </button>

          {isLoading && (
            <p className="text-sm text-gray-500 text-center">
              A popup window should appear for authentication.
              <br />
              If you don't see it, please check if it was blocked by your
              browser.
            </p>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            We use Google authentication to secure your account.
            <br />
            Your Google email address will be used to identify you in PermaVid.
          </p>
        </div>

        <div className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
          <p>
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
