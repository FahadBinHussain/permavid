"use client";

import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

// Auth context interface
interface AuthContextType {
  user: any | null;
  status: "loading" | "authenticated" | "unauthenticated";
  error: string | null;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  status: "loading",
  error: null,
  signIn: () => {},
  signOut: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// Google OAuth provider wrapper
export function AuthProvider({ children }: { children: ReactNode }) {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthContextProvider>{children}</AuthContextProvider>
    </GoogleOAuthProvider>
  );
}

// Internal auth context provider
function AuthContextProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [status, setStatus] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");
  const [error, setError] = useState<string | null>(null);

  // Initialize auth state from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem("auth_user");
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setUser(userData);
        setStatus("authenticated");
      } catch (e) {
        localStorage.removeItem("auth_user");
        setStatus("unauthenticated");
      }
    } else {
      setStatus("unauthenticated");
    }
  }, []);

  const googleLogin = useGoogleLogin({
    flow: "auth-code",
    onSuccess: async (tokenResponse) => {
      try {
        // Get user info from Google
        const userInfoResponse = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          {
            headers: {
              Authorization: `Bearer ${tokenResponse.access_token}`,
            },
          },
        );

        if (!userInfoResponse.ok) {
          throw new Error("Failed to get user info");
        }

        const userInfo = await userInfoResponse.json();

        // Save user to database first
        let userData;
        try {
          const response = await fetch("/api/users", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              googleId: userInfo.sub,
              name: userInfo.name,
              email: userInfo.email,
              image: userInfo.picture,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
              errorData.error || "Failed to save user to database",
            );
          }

          const result = await response.json();
          userData = {
            id: result.user.id,
            name: result.user.displayName || userInfo.name,
            email: result.user.email,
            image: userInfo.picture,
          };

          console.log("User saved to database successfully");
        } catch (dbError) {
          console.error("Error saving user to database:", dbError);
          throw new Error(
            "Failed to save user to database: " +
              (dbError instanceof Error ? dbError.message : "Unknown error"),
          );
        }

        // Save to localStorage and state
        localStorage.setItem("auth_user", JSON.stringify(userData));
        setUser(userData);
        setStatus("authenticated");
        setError(null);
      } catch (error) {
        console.error("Login error:", error);
        setError(error instanceof Error ? error.message : "Login failed");
        setStatus("unauthenticated");
      }
    },
    onError: (error) => {
      console.error("Google login error:", error);
      setError("Google login failed");
      setStatus("unauthenticated");
    },
    onNonOAuthError: (error) => {
      console.error("Google login non-OAuth error (popup closed?):", error);
      setError(null); // Don't show error for popup closed
      setStatus("unauthenticated");
    },
  });

  // Enhanced signIn function that handles popup detection
  const handleSignIn = () => {
    console.log("Starting Google sign-in process");
    setError(null);
    setStatus("loading");

    // Start the Google login process
    googleLogin();

    // Set a timeout to reset state if popup was closed
    const resetTimeout = setTimeout(() => {
      if (status === "loading") {
        console.log("Sign-in timeout reached, resetting to unauthenticated");
        setStatus("unauthenticated");
        setError(null);
      }
    }, 60000); // 60 second timeout

    // Clear timeout if login succeeds/fails before timeout
    const originalOnSuccess = googleLogin.onSuccess;
    const originalOnError = googleLogin.onError;

    // We'll clear the timeout when any result occurs
    if (resetTimeout) {
      setTimeout(() => clearTimeout(resetTimeout), 100);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem("auth_user");
    setUser(null);
    setStatus("unauthenticated");
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        error,
        signIn: handleSignIn,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
