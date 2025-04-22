import { NextResponse } from 'next/server';
import { uploadToFilemoon, getQueue } from '@/lib/queue'; // Assuming getQueue might be useful for checks, or just uploadToFilemoon

// POST request to trigger upload for a specific item ID
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id: itemId } = params;

  if (!itemId) {
    return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
  }

  console.log(`Received upload request for item ID: ${itemId}`);

  try {
    // Optional: Add checks here, e.g., ensure item exists and is 'completed' before attempting upload
    // const currentQueue = getQueue();
    // const itemExists = currentQueue.find(item => item.id === itemId && item.status === 'completed');
    // if (!itemExists) {
    //     return NextResponse.json({ error: `Item ${itemId} not found or not completed.` }, { status: 404 });
    // }

    const result = await uploadToFilemoon(itemId);

    if (result.success) {
      // console.log(`Successfully initiated/completed upload for item ${itemId}: ${result.message}`); // Logged in lib/queue.ts
      return NextResponse.json({ message: result.message, filecode: result.filecode });
    } else {
      console.error(`Upload failed for item ${itemId}: ${result.message}`);
      // Determine appropriate status code based on error (e.g., 404 if item not found, 500 for server errors)
       // For simplicity, using 500 for most failures now
      return NextResponse.json({ error: result.message || 'Failed to upload item to Filemoon' }, { status: 500 });
    }

  } catch (error: any) {
    console.error(`Error processing upload request for item ${itemId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error during upload process' }, { status: 500 });
  }
}

// Optional: GET handler if needed later, e.g., to check upload status if Filemoon provided one
// export async function GET(request: Request, { params }: { params: { id: string } }) {
//   // ... implementation ...
// } 