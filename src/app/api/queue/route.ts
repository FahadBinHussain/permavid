import { NextResponse } from 'next/server';
import { getQueue, QueueItem } from '@/lib/queue';

export async function GET(request: Request) {
  try {
    const currentQueue = getQueue();
    return NextResponse.json(currentQueue);
  } catch (error: any) {
    console.error('Error fetching full queue:', error);
    return NextResponse.json({ error: 'Failed to fetch full queue state' }, { status: 500 });
  }
} 