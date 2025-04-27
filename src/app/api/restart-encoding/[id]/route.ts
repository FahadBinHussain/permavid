import { NextResponse } from 'next/server';
import { restartFilemoonEncoding } from '@/lib/queue';

// Add these export configurations for static export compatibility
export const dynamic = 'force-dynamic';
export const revalidate = 0; // No cache, always fetch fresh data

// POST request to trigger encoding restart for a specific item ID
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const itemId = params.id;

  if (!itemId) {
    return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
  }

  console.log(`Received restart encoding request for item ID: ${itemId}`);

  try {
    const result = await restartFilemoonEncoding(itemId);

    if (result.success) {
      console.log(`Successfully requested encoding restart for item ${itemId}: ${result.message}`);
      return NextResponse.json({ message: result.message });
    } else {
      console.error(`Restart encoding failed for item ${itemId}: ${result.message}`);
      // Using 400 for client errors (e.g., wrong state, not found) and 500 for API/server issues
      const statusCode = result.message.includes('not found') || result.message.includes('state') ? 400 : 500;
      return NextResponse.json({ error: result.message || 'Failed to restart encoding' }, { status: statusCode });
    }

  } catch (error: any) {
    console.error(`Error processing restart encoding request for item ${itemId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error during restart encoding process' }, { status: 500 });
  }
} 