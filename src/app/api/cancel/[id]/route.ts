import { NextRequest, NextResponse } from 'next/server';
import { cancelItem } from '@/lib/queue'; // Restore import

// Remove incompatible export configurations for static export
// export const dynamic = 'force-dynamic';
// export const revalidate = 0; 

// DELETE request to cancel a specific item ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: itemId } = await params; // Destructure after awaiting

  console.log(`Received cancel request for item ID: ${itemId}`); // Use correct variable

  if (!itemId) {
    // This check might be less necessary now if await params ensures it exists, but keep for safety
    return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
  }
  
  // --- Restore original logic --- 
  try {
    const result = cancelItem(itemId);

    if (result.success) {
      console.log(`Successfully cancelled item ${itemId}: ${result.message}`);
      return NextResponse.json({ message: result.message });
    } else {
      console.error(`Cancel failed for item ${itemId}: ${result.message}`);
      // Determine appropriate status code based on error 
      return NextResponse.json({ error: result.message || 'Failed to cancel item' }, { status: 400 });
    }

  } catch (error: any) {
    console.error(`Error processing cancel request for item ${itemId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error during cancel process' }, { status: 500 });
  }
} 