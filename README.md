# PermaVid

PermaVid is a local video archiving tool that helps you download, manage, and archive videos from various sources.

<img src="https://wakapi-qt1b.onrender.com/api/badge/fahad/interval:any/project:permavid" 
     alt="Wakapi Time Tracking" 
     title="Spent more than that amount of time spent on this project">

## 🚀 Quick Start (Tauri App)

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. **Set up Google Authentication** (required):
   - Create a `.env.local` file with your Google OAuth credentials
   - See [Authentication Setup](./docs/AUTH_SETUP.md) for detailed instructions
3. Run the Tauri app in development mode:
   ```bash
   pnpm run dev:tauri
   ```

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

## Building for Production

- **Tauri:**
  ```bash
  pnpm run build:tauri
  ```
- **Electron:**
  ```bash
  pnpm run build && pnpm run dist
  ```
- **Next.js:**
  ```bash
  pnpm run build && pnpm start
  ```

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
