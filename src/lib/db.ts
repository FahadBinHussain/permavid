import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// --- Configuration --- 
const dbPath = path.resolve(process.cwd(), 'permavid_local.sqlite');

// --- Database Setup --- 
let db: Database.Database;

try {
  // Ensure the directory for the database exists (though CWD should always exist)
  // Use synchronous fs operations here as it's part of critical startup
  try { fs.mkdirSync(path.dirname(dbPath), { recursive: true }); } catch (e) { /* ignore */ }

  db = new Database(dbPath, { /* verbose: console.log */ }); // Add verbose for debugging if needed

  // Enable WAL mode for better concurrency 
  db.pragma('journal_mode = WAL');
  
  console.log(`SQLite database initialized at: ${dbPath}`);

} catch (dbError) {
  console.error("------------------------------------------");
  console.error("FATAL: Could not initialize SQLite database!");
  console.error(dbError);
  console.error(`Database path: ${dbPath}`);
  console.error("Ensure the application has write permissions to this location.");
  console.error("------------------------------------------");
  // If the DB fails, throw an error to prevent the app from starting incorrectly
  throw new Error(`Failed to initialize database: ${dbError}`);
}

// Export the initialized database connection
export { db }; 