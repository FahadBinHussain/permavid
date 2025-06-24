import { NextRequest, NextResponse } from 'next/server';
import { addToQueue } from '@/lib/queue';

/**
 * API endpoint to add a new archive to the database
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    const { url } = body;
    
    if (!url) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'URL is required' 
        },
        { status: 400 }
      );
    }
    
    // Add the URL to the queue
    const result = await addToQueue(url);
    
    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        message: result.message,
        item: result.item
      });
    } else {
      return NextResponse.json(
        { 
          success: false, 
          error: result.message 
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error adding to archive:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to add to archive' 
      },
      { status: 500 }
    );
  }
} 