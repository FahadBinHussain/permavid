import { NextResponse } from 'next/server';
import { uploadToFilemoon, uploadToFilesVC, getQueue } from '@/lib/queue';
import { getSetting } from '@/lib/settings';

// POST request to trigger upload for a specific item ID
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id: itemId } = await params;

  if (!itemId) {
    return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
  }

  console.log(`Received upload request for item ID: ${itemId}`);

  try {
    // Get the upload target from settings
    const uploadTarget = getSetting('upload_target', 'filemoon');
    
    // Determine where to upload based on the upload_target setting
    if (uploadTarget === 'filemoon' || uploadTarget === 'both') {
      // Upload to Filemoon
      const filemoonResult = await uploadToFilemoon(itemId);
      
      if (!filemoonResult.success && uploadTarget === 'filemoon') {
        // If we're only uploading to Filemoon and it failed, return an error
        console.error(`Upload to Filemoon failed for item ${itemId}: ${filemoonResult.message}`);
        return NextResponse.json({ error: filemoonResult.message || 'Failed to upload item to Filemoon' }, { status: 500 });
      }
      
      // If we're uploading to both, continue even if Filemoon failed
      if (uploadTarget === 'both' && !filemoonResult.success) {
        console.warn(`Upload to Filemoon failed, continuing with Files.vc: ${filemoonResult.message}`);
      }
      
      // If we're only uploading to Filemoon and it succeeded, return success
      if (uploadTarget === 'filemoon') {
        return NextResponse.json({ 
          message: filemoonResult.message, 
          filecode: filemoonResult.filecode,
          service: 'filemoon'
        });
      }
    }
    
    // If we're here, we need to upload to Files.vc
    if (uploadTarget === 'files_vc' || uploadTarget === 'both') {
      const filesVcResult = await uploadToFilesVC(itemId);
      
      if (!filesVcResult.success) {
        console.error(`Upload to Files.vc failed for item ${itemId}: ${filesVcResult.message}`);
        return NextResponse.json({ error: filesVcResult.message || 'Failed to upload item to Files.vc' }, { status: 500 });
      }
      
      return NextResponse.json({ 
        message: filesVcResult.message, 
        filecode: filesVcResult.filecode,
        service: uploadTarget === 'both' ? 'both' : 'files_vc'
      });
    }
    
    // This shouldn't happen if upload_target is valid
    return NextResponse.json({ error: 'Invalid upload target setting' }, { status: 500 });

  } catch (error: any) {
    console.error(`Error processing upload request for item ${itemId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error during upload process' }, { status: 500 });
  }
}

// Optional: GET handler if needed later, e.g., to check upload status if Filemoon provided one
// export async function GET(request: Request, { params }: { params: { id: string } }) {
//   // ... implementation ...
// } 