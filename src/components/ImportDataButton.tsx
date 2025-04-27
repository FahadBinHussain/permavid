'use client';

import { useState } from 'react';
import { useTauri } from '@/app/tauri-integration';
import { open } from '@tauri-apps/api/dialog';

export default function ImportDataButton() {
  const { isTauriEnvironment, importFromFile } = useTauri();
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Only render in Tauri environment
  if (!isTauriEnvironment) {
    return null;
  }

  const handleImport = async () => {
    try {
      setIsImporting(true);
      setImportResult(null);
      
      // Open a file dialog to select the database file
      const selected = await open({
        filters: [{
          name: 'SQLite Database',
          extensions: ['sqlite', 'db', 'sqlite3']
        }],
        multiple: false,
        directory: false
      });
      
      if (selected && typeof selected === 'string') {
        await importFromFile(selected);
        setImportResult(`Successfully imported data from ${selected}`);
      }
    } catch (error) {
      console.error('Import failed:', error);
      setImportResult(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-sm mb-4">
      <h2 className="text-lg font-semibold mb-2">Import Previous Data</h2>
      <p className="text-sm text-gray-600 mb-3">
        If your previous data wasn't automatically imported, you can manually select your old database file.
      </p>
      
      <button
        onClick={handleImport}
        disabled={isImporting}
        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {isImporting ? 'Importing...' : 'Import Database'}
      </button>
      
      {importResult && (
        <div className={`mt-3 p-2 text-sm rounded ${
          importResult.startsWith('Successfully') 
            ? 'bg-green-50 text-green-700' 
            : 'bg-red-50 text-red-700'
        }`}>
          {importResult}
        </div>
      )}
    </div>
  );
} 