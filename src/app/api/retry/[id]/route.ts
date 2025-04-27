import { NextRequest, NextResponse } from 'next/server';
import { retryFailedDownloadOrUpload } from '@/lib/queue';

// Add these export configurations for static export compatibility
export const dynamic = 'force-dynamic';
export const revalidate = 0; // No cache, always fetch fresh data

// POST request to retry a failed item (if retryable)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: itemId } = await params;

  if (!itemId) {
    return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
  }

  console.log(`Received retry request for item ID: ${itemId}`);

  try {
    const result = retryFailedDownloadOrUpload(itemId);

    if (result.success) {
      console.log(`Successfully re-queued item ${itemId}: ${result.message}`);
      return NextResponse.json({ message: result.message });
    } else {
      console.error(`Retry failed for item ${itemId}: ${result.message}`);
      // Using 400 for client errors (e.g., wrong state, not found) and 500 for DB issues
      const statusCode = result.message.includes('not found') || result.message.includes('state') ? 400 : 500;
      return NextResponse.json({ error: result.message || 'Failed to retry item' }, { status: statusCode });
    }

  } catch (error: any) {
    console.error(`Error processing retry request for item ${itemId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error during retry process' }, { status: 500 });
  }
} 