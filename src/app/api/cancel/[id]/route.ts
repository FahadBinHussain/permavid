import { NextRequest, NextResponse } from 'next/server';
import { cancelItem } from '@/lib/queue';

// Add these export configurations for static export compatibility
export const dynamic = 'force-dynamic';
export const revalidate = 0; // No cache, always fetch fresh data 

// DELETE request to cancel a specific item ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const itemId = params.id;

  if (!itemId) {
    return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
  }

  console.log(`Received cancel request for item ID: ${itemId}`);

  try {
    const result = cancelItem(itemId); // Note: cancelItem is synchronous in the current implementation

    if (result.success) {
      console.log(`Successfully cancelled item ${itemId}: ${result.message}`);
      return NextResponse.json({ message: result.message });
    } else {
      console.error(`Cancel failed for item ${itemId}: ${result.message}`);
      // Determine appropriate status code based on error (e.g., 404 if item not found, 400/409 if wrong state)
      // Using 400 for general client-side cancel failures for now
      return NextResponse.json({ error: result.message || 'Failed to cancel item' }, { status: 400 });
    }

  } catch (error: any) {
    console.error(`Error processing cancel request for item ${itemId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error during cancel process' }, { status: 500 });
  }
} 