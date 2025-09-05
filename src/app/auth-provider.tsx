"use client";

import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  Component,
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

// Error Boundary to catch popup window closed errors
class AuthErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    // Check if this is a popup window closed error
    if (
      error.message &&
      (error.message.includes("Popup window closed") ||
        error.message.includes("popup_closed"))
    ) {
      console.log(
        "AuthErrorBoundary: Caught popup window closed error, ignoring",
      );
      return { hasError: false }; // Don't show error UI
    }
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    if (
      error.message &&
      (error.message.includes("Popup window closed") ||
        error.message.includes("popup_closed"))
    ) {
      console.log("AuthErrorBoundary: Popup window closed, not logging error");
      return;
    }
    console.error("AuthErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-red-600">
              Something went wrong
            </h2>
            <p className="text-gray-600 mt-2">
              Please refresh the page and try again.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Google OAuth provider wrapper
export function AuthProvider({ children }: { children: ReactNode }) {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthErrorBoundary>
        <AuthContextProvider>{children}</AuthContextProvider>
      </AuthErrorBoundary>
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

  // Global error handler for popup window closed errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const errorMessage = event.error?.message || event.message || "";
      if (
        errorMessage.includes("Popup window closed") ||
        errorMessage.includes("popup_closed")
      ) {
        console.log(
          "Global error handler: Popup window closed detected, resetting auth state",
        );
        setStatus("unauthenticated");
        setError(null);
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason?.message || event.reason || "";
      if (
        reason.toString().includes("Popup window closed") ||
        reason.toString().includes("popup_closed")
      ) {
        console.log(
          "Unhandled promise rejection: Popup window closed detected, resetting auth state",
        );
        setStatus("unauthenticated");
        setError(null);
        event.preventDefault(); // Prevent console error
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  }, []);

  // Initialize auth state from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem("auth_user");
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setStatus("authenticated");
      } catch (error) {
        console.error("Error parsing saved user:", error);
        localStorage.removeItem("auth_user");
        setStatus("unauthenticated");
      }
    } else {
      setStatus("unauthenticated");
    }
  }, []);

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        console.log("Token response received:", tokenResponse);

        // Check if we have an access token
        if (!tokenResponse.access_token) {
          console.error("No access token in response:", tokenResponse);
          throw new Error("No access token received from Google");
        }

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
          const errorText = await userInfoResponse.text();
          console.error(
            "User info fetch failed:",
            userInfoResponse.status,
            errorText,
          );
          throw new Error(
            `Failed to get user info: ${userInfoResponse.status}`,
          );
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

        // Save default settings for new users (in Tauri environment only)
        if (typeof window !== "undefined" && (window as any).__TAURI__) {
          try {
            const { invoke } = await import("@tauri-apps/api/tauri");

            // Check if user has existing settings
            const existingSettings = await invoke("get_settings", {
              userId: userData.id,
            });

            // If no existing settings found, save defaults
            if (
              !existingSettings ||
              Object.keys(existingSettings).length === 0
            ) {
              console.log("New user detected, saving default settings");

              const defaultSettings = {
                filemoon_api_key: "",
                download_directory: "", // Will be set by backend
                delete_after_upload: "true",
                auto_upload: "true",
                upload_target: "filemoon",
              };

              await invoke("save_settings", {
                userId: userData.id,
                settings: defaultSettings,
              });

              console.log("Default settings saved for new user");
            }
          } catch (settingsError) {
            console.log(
              "Could not save default settings (likely not in Tauri environment):",
              settingsError,
            );
          }
        }
      } catch (error) {
        console.error("Login error:", error);
        setError(error instanceof Error ? error.message : "Login failed");
        setStatus("unauthenticated");
      }
    },
    onError: (error) => {
      console.error("Google login error:", error);

      // Convert error to string for checking
      let errorString = "";
      if (typeof error === "string") {
        errorString = error;
      } else if (error && typeof error === "object" && "message" in error) {
        errorString = (error as any).message;
      } else if (error?.toString) {
        errorString = error.toString();
      } else {
        errorString = JSON.stringify(error);
      }

      // Don't show error if popup was closed by user - check multiple variations
      const isPopupClosed =
        errorString.toLowerCase().includes("popup") ||
        errorString.toLowerCase().includes("window closed") ||
        errorString.toLowerCase().includes("user_cancelled") ||
        errorString.toLowerCase().includes("access_denied") ||
        errorString === "Error: Popup window closed";

      if (isPopupClosed) {
        console.log("User closed popup or cancelled, not showing error");
        setError(null);
      } else {
        console.log("Actual login error occurred:", errorString);
        setError("Google login failed");
      }
      setStatus("unauthenticated");
    },
    onNonOAuthError: (error) => {
      // Check if this is a popup closed error
      const errorMessage =
        (error && typeof error === "object" && "message" in error
          ? (error as any).message
          : error?.toString()) || "";
      const isPopupClosed =
        (error &&
          typeof error === "object" &&
          "type" in error &&
          (error as any).type === "popup_closed") ||
        errorMessage.includes("Popup window closed") ||
        errorMessage.includes("popup_closed");

      if (isPopupClosed) {
        console.log("User closed popup, silently resetting auth state");
      } else {
        console.error("Google login non-OAuth error:", error);
      }

      setError(null); // Don't show error for popup closed
      setStatus("unauthenticated");
    },
  });

  // Enhanced signIn function that handles popup detection
  const handleSignIn = () => {
    console.log("Starting Google sign-in process");
    setError(null);
    setStatus("loading");

    try {
      // Start the Google login process
      googleLogin();

      // Set a timeout to reset state if popup was closed
      const resetTimeout = setTimeout(() => {
        console.log("Sign-in timeout reached, resetting to unauthenticated");
        setStatus("unauthenticated");
        setError(null);
      }, 30000); // 30 second timeout

      // Store timeout to clear it later
      (window as any).authResetTimeout = resetTimeout;
    } catch (error) {
      console.log("Error in handleSignIn:", error);
      setStatus("unauthenticated");
      setError(null);
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
