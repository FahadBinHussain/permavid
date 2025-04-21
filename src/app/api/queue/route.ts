import { NextResponse } from 'next/server';
import { getActiveQueue } from '@/lib/queue'; // <-- Change to getActiveQueue

export async function GET(request: Request) {
  try {
    const currentQueue = getActiveQueue(); // <-- Use getActiveQueue
    return NextResponse.json(currentQueue);
  } catch (error: any) {
    console.error('Error fetching active queue:', error);
    return NextResponse.json({ error: 'Failed to fetch active queue state' }, { status: 500 });
  }
} 