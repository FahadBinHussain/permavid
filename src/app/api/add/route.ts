import { NextResponse } from 'next/server';
import { addToQueue, QueueItem } from '@/lib/queue'; // Import type too

// Remove incompatible export configurations for static export
// export const dynamic = 'force-dynamic';
// export const revalidate = 0; // No cache, always fetch fresh data

// Remove unused imports related to direct download
// import fs from 'fs/promises';
// import path from 'path';
// import { execFile } from 'child_process';
// import { promisify } from 'util';

// const execFileAsync = promisify(execFile);
// const downloadDir = path.resolve(process.cwd(), 'downloads');
// async function ensureDirExists(dirPath: string) { ... } // Moved to queue.ts

export async function POST(request: Request) {
  try {
    // No need to ensure dir exists here anymore
    // await ensureDirExists(downloadDir);

    const body = await request.json();
    const url = body.url;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required and must be a string' }, { status: 400 });
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    console.log('Received URL request:', url);

    // Add to queue and handle result
    const result = addToQueue(url);

    if (result.success && result.item) {
      // Respond immediately that it's been queued
      return NextResponse.json({ message: result.message, itemId: result.item.id, url: url });
    } else {
      // Handle cases where item wasn't added (e.g., duplicate URL or DB error)
      // Return a 409 Conflict for duplicates, 500 otherwise
      const status = result.message?.includes('already exists') ? 409 : 500;
      return NextResponse.json({ error: result.message || 'Failed to add URL to queue' }, { status });
    }

  } catch (error: any) {
    console.error('Error processing /api/add request:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    // Ensure a generic error is returned if specific handling fails
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 