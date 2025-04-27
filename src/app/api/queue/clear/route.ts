import { NextRequest, NextResponse } from 'next/server';
import {
  clearCompleted,
  clearFailed,
  clearFinished,
  clearCancelled
} from '@/lib/queue';

// Using DELETE method for clearing resources
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') as 'completed' | 'failed' | 'finished' | 'cancelled' | null;

  if (!type) {
    return NextResponse.json({ error: 'Type parameter (completed, failed, finished, cancelled) is required' }, { status: 400 });
  }

  console.log(`Received clear request for type: ${type}`);

  let result: { success: boolean; count: number; message: string };

  try {
    switch (type) {
      case 'completed':
        result = clearCompleted();
        break;
      case 'failed':
        result = clearFailed();
        break;
      case 'finished':
        result = clearFinished();
        break;
      case 'cancelled':
        result = clearCancelled();
        break;
      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }

    if (result.success) {
      console.log(`Successfully cleared ${type} items: Count=${result.count}`);
      return NextResponse.json({ message: result.message, count: result.count });
    } else {
      console.error(`Clear failed for type ${type}: ${result.message}`);
      return NextResponse.json({ error: result.message || `Failed to clear ${type} items` }, { status: 500 });
    }

  } catch (error: any) {
    console.error(`Error processing clear request for type ${type}:`, error);
    return NextResponse.json({ error: 'Internal Server Error during clear process' }, { status: 500 });
  }
}

// Add these export configurations for static export compatibility
export const dynamic = 'force-dynamic';
export const revalidate = 0; // No cache, always fetch fresh data 