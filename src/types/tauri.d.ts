// Type definitions for Tauri APIs
interface TauriInterface {
  convertFileSrc: (src: string, protocol: string) => string;
  invoke: <T>(cmd: string, args?: unknown) => Promise<T>;
  // Add other Tauri API methods as needed
}

declare global {
  interface Window {
    __TAURI__?: TauriInterface;
  }
}

export {}; 