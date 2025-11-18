# PermaVid Tauri

This is the Tauri implementation of PermaVid, a local video archiving tool.

## Prerequisites

Before you can build and run the Tauri version of PermaVid, make sure you have the following prerequisites installed:

1. **Rust and Cargo**: Install from [rustup.rs](https://rustup.rs/)
2. **Node.js and npm**: Install from [nodejs.org](https://nodejs.org/)
3. **Tauri CLI**: Install using `npm install -g @tauri-apps/cli`
4. **Platform-specific dependencies**:
   - On Windows: Microsoft Visual Studio C++ Build Tools
   - On macOS: Xcode Command Line Tools
   - On Linux: Various development packages (check [Tauri's setup guide](https://tauri.app/v1/guides/getting-started/prerequisites))

## Development

npm run dev:tauri


## Building for Production

To build the application for production:

```bash
# From the project root
npm run dist:tauri
```

This will:
1. Build the Next.js application
2. Bundle it with Tauri
3. Create platform-specific installers in the `tauri/target/release/bundle` directory

## Architecture

The Tauri version of PermaVid uses:

- **Frontend**: React & Next.js (same as the Electron version)
- **Backend**: Rust with Tauri framework (instead of Electron's Node.js)
- **Database**: SQLite via the `rusqlite` crate
- **Communication**: Tauri's IPC system for communicating between frontend and backend

## Differences from Electron Version

The Tauri implementation differs from the Electron version in several ways:

1. **Bundle Size**: Tauri applications are typically much smaller
2. **Performance**: Generally better memory usage and startup time
3. **Security**: More restrictive permissions model
4. **Backend Language**: Rust instead of Node.js

## Permissions

The application requires the following permissions:

- `shell-open`: To open links in the default browser
- `fs-read-file`, `fs-write-file`: To work with the local filesystem
- `dialog-all`: For file picker dialogs
- `http-all`: For network requests

These permissions are configured in the `tauri.conf.json` file.

## Testing

The application includes a test page at `/tauri-test` where you can verify that Tauri integration is working correctly. 