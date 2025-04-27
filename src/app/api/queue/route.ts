import { NextResponse } from 'next/server';
import { getQueue, QueueItem } from '@/lib/queue';

// Remove incompatible export configurations for static export
// export const dynamic = 'force-dynamic';
// export const revalidate = 0; // No cache, always fetch fresh data

export async function GET(request: Request) {
  try {
    const currentQueue = getQueue();
    return NextResponse.json(currentQueue);
  } catch (error: any) {
    console.error('Error fetching full queue:', error);
    return NextResponse.json({ error: 'Failed to fetch full queue state' }, { status: 500 });
  }
} 