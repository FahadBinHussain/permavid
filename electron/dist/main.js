"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
// import isDev from 'electron-is-dev'; // <-- Remove static import
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow = null;
async function createWindow() {
    // Dynamically import electron-is-dev (alternative syntax)
    // const isDev = (await import('electron-is-dev')).default;
    // const isDevImport = await import('electron-is-dev');
    // const isDev = isDevImport.default;
    // Use Electron's built-in check instead of the external package
    const isDev = !electron_1.app.isPackaged;
    // Create the browser window.
    mainWindow = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false, // Disable Node.js integration in renderer process for security
            contextIsolation: true, // Enable context isolation
            preload: path_1.default.join(__dirname, 'preload.js'), // Use a preload script (optional but recommended)
            // Consider enabling sandbox: true for enhanced security, might require adjustments
        },
    });
    // Determine the URL to load
    const startUrl = isDev
        ? 'http://localhost:3000' // URL of the Next.js dev server
        : `file://${path_1.default.join(__dirname, '../out/index.html')}`; // Path to the production build
    mainWindow.loadURL(startUrl);
    // --- Intercept New Window Requests --- 
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // Check if the URL is for Filemoon (or could be more specific)
        if (url.startsWith('https://filemoon.sx/') || url.startsWith('http://filemoon.sx/')) {
            console.log(`Intercepted window open request for: ${url}. Opening externally.`);
            // Open the URL in the default system browser
            electron_1.shell.openExternal(url);
            // Prevent Electron from opening a new window
            return { action: 'deny' };
        }
        // Allow other URLs to open new Electron windows if needed (or deny all)
        console.log(`Allowing window open request for: ${url}`);
        return { action: 'allow' }; // Or return { action: 'deny' }; to prevent all new windows
    });
    // Open the DevTools automatically if in development
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }
    // Emitted when the window is closed.
    mainWindow.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });
}
// --- App Lifecycle Events ---
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
// Make the 'ready' handler async to support top-level await for the dynamic import
// No longer need async here as we removed the dynamic import
electron_1.app.on('ready', createWindow);
// Quit when all windows are closed, except on macOS.
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { // 'darwin' is macOS
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    }
});
// --- IPC Handlers --- 
// Handle the message from the renderer to open a link externally
electron_1.ipcMain.handle('open-external-link', async (event, url) => {
    console.log(`IPC Handler 'open-external-link' received URL: ${url}`); // <-- Add log here
    try {
        await electron_1.shell.openExternal(url);
        console.log(`IPC: Opened external link: ${url}`);
        return { success: true };
    }
    catch (error) {
        console.error(`Failed to open external link ${url}:`, error);
        return { success: false, error: error.message };
    }
});
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here. 
