# PermaVid

PermaVid is a local video archiving tool that helps you download, manage, and archive videos from various sources.

<img src="https://wakapi-qt1b.onrender.com/api/badge/fahad/interval:any/project:permavid" 
     alt="Wakapi Time Tracking" 
     title="Spent more than that amount of time spent on this project">

## 🚀 Quick Start (Tauri App)

1. Install dependencies
   pnpm install
2. set up prisma:
   pnpm prisma generate
3. Run the Tauri app in development mode:
   pnpm run dev:tauri

---

## Authentication

PermaVid now requires users to sign in with Google when the application launches. This helps secure your archives and provides a personalized experience. See [Authentication Setup](./docs/AUTH_SETUP.md) for instructions on configuring Google OAuth.

## Database Setup with Neon PostgreSQL

This application uses Neon PostgreSQL as its database for archives. Follow these steps to set up your database:

1. Create a free account at [Neon](https://neon.tech/)
2. Create a new project and database
3. Get your connection string from the Neon dashboard
4. Create a `.env` file in the root of the project with the following content:
   ```
   NEON_DATABASE_URL=postgresql://[user]:[password]@[neon-hostname]/[dbname]
   ```
   Replace the placeholders with your actual connection details.
5. Run the database initialization script:
   ```
   pnpm db:init
   ```

### Database Features

- **User Identification**: Each archive is associated with a user ID, allowing tracking of who archived which link
- **Archive Access**: Archives can be accessed by users
- **User-specific Settings**: Settings are stored per-user

## Development

### Next.js (Web Only)
To run the Next.js app in your browser:
```bash
pnpm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Electron (Desktop)
To run the Electron app in development mode:
```bash
pnpm run dev:electron
```

---

## 🏗️ Building for Production

### Prerequisites for Production Build

Before building, ensure you have:
1. **Rust installed** (for Tauri): https://rustup.rs/
2. **All dependencies installed**: `pnpm install`
3. **Environment variables configured**:
   - `.env.local` with Google OAuth credentials
   - `.env` with Neon PostgreSQL connection string

### Tauri Desktop App (Recommended)

The Tauri build creates a native desktop application with the smallest file size and best performance:

1. **Development build** (for testing):
   ```bash
   pnpm run build:tauri
   ```

2. **Production release build**:
   ```bash
   pnpm run tauri build
   ```

This will create:
- **Windows**: `.exe` installer in `tauri/target/release/bundle/msi/`
- **macOS**: `.app` and `.dmg` in `tauri/target/release/bundle/dmg/`
- **Linux**: `.deb`, `.rpm`, and `.AppImage` in `tauri/target/release/bundle/`

### Build Configuration

The production build automatically:
- ✅ Sets auto-upload to `true` by default
- ✅ Sets delete-after-upload to `true` by default  
- ✅ Uses user's Downloads directory automatically
- ✅ Includes simplified 2-state system (downloaded → uploaded)
- ✅ Handles popup-closed errors gracefully
- ✅ Creates default settings for new users

### Alternative Build Methods

**Electron (if preferred):**
```bash
pnpm run build && pnpm run dist
```

**Next.js Web App:**
```bash
pnpm run build && pnpm start
```

### Distribution

The final executable will be a standalone installer that includes:
- Complete video downloading capabilities (yt-dlp)
- Local PostgreSQL database
- All dependencies bundled
- No additional runtime requirements

---

## Project Structure
- `src/` - Main source code
- `electron/` - Electron main & preload scripts
- `tauri/` - Tauri configuration
- `out/` - Build output

---

## API Endpoints

### Archives
- `GET /api/archives` - Get all archives
- `GET /api/archives/[id]` - Get details of a specific archive
- `POST /api/archives/add` - Add a new archive

---

## Learn More
- [Tauri Documentation](https://tauri.app/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Electron Documentation](https://www.electronjs.org/docs)

## License

MIT
