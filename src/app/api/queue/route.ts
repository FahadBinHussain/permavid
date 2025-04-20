import { NextResponse } from 'next/server';
import { getQueue } from '@/lib/queue'; // Import from the new queue module

export async function GET(request: Request) {
  try {
    const currentQueue = getQueue();
    return NextResponse.json(currentQueue);
  } catch (error: any) {
    console.error('Error fetching queue:', error);
    return NextResponse.json({ error: 'Failed to fetch queue state' }, { status: 500 });
  }
} 