import { NextResponse } from 'next/server';
import { getEncodedItems, QueueItem } from '@/lib/queue';

// --- Interfaces (Simplified) ---

// Define the structure of items sent to the frontend
// This can now directly use QueueItem or a subset if preferred
// For simplicity, we'll just send QueueItem as returned by getEncodedItems

export async function GET(request: Request) {
  try {
    // Get encoded items (which should have filemoon_url/filecode)
    const encodedItems: QueueItem[] = getEncodedItems();

    // No API key needed here anymore
    // No embed domain needed here anymore
    // No concurrent fetching needed here anymore

    console.log('API: Sending basic encoded item data to gallery:', JSON.stringify(encodedItems.length, null, 2)); // Log count
    return NextResponse.json(encodedItems);

  } catch (error: any) {
    console.error('API: Error processing gallery request:', error);
    return NextResponse.json({ error: 'Failed to fetch encoded items for gallery' }, { status: 500 });
  }
}

// Add these export configurations for static export compatibility
export const dynamic = 'force-dynamic';
export const revalidate = 0; // No cache, always fetch fresh data 