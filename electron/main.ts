import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
// import isDev from 'electron-is-dev'; // <-- Remove static import

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  // Dynamically import electron-is-dev (alternative syntax)
  // const isDev = (await import('electron-is-dev')).default;
  // const isDevImport = await import('electron-is-dev');
  // const isDev = isDevImport.default;

  // Use Electron's built-in check instead of the external package
  const isDev = !app.isPackaged;

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false, // Disable Node.js integration in renderer process for security
      contextIsolation: true, // Enable context isolation
      preload: path.join(__dirname, 'preload.js'), // Use a preload script (optional but recommended)
      // Consider enabling sandbox: true for enhanced security, might require adjustments
    },
  });

  // Determine the URL to load
  const startUrl = isDev
    ? 'http://localhost:3000' // URL of the Next.js dev server
    : `file://${path.join(__dirname, '../out/index.html')}`; // Path to the production build

  mainWindow.loadURL(startUrl);

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
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { // 'darwin' is macOS
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

// --- IPC Handlers (Example - can be added later if needed) ---
// Example: Handle a message from the renderer process
// ipcMain.handle('some-action', async (event, arg) => {
//   // Do something in the main process
//   return 'result from main';
// });

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here. 