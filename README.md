# PermaVid

<img src="https://wakapi-qt1b.onrender.com/api/badge/fahad/interval:any/
project:PermaVid" 
     alt="Wakapi Time Tracking" 
     title="Minimum amount of time spent on this project">

## 🚀 Quick Start (Tauri App)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the Tauri app in development mode:
   ```bash
   npm run dev:tauri
   ```

---

## Development

### Next.js (Web Only)
To run the Next.js app in your browser:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Electron (Desktop)
To run the Electron app in development mode:
```bash
npm run dev:electron
```

---

## Building for Production

- **Tauri:**
  ```bash
  npm run build:tauri
  ```
- **Electron:**
  ```bash
  npm run build && npm run dist
  ```
- **Next.js:**
  ```bash
  npm run build && npm start
  ```

---

## Project Structure
- `src/` - Main source code
- `electron/` - Electron main & preload scripts
- `tauri/` - Tauri configuration
- `out/` - Build output

---

## Learn More
- [Tauri Documentation](https://tauri.app/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Electron Documentation](https://www.electronjs.org/docs)
