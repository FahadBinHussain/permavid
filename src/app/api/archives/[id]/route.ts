import { NextRequest, NextResponse } from 'next/server';
import { getItemById } from '@/lib/queue';

/**
 * API endpoint to get a specific archive by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Archive ID is required' 
        },
        { status: 400 }
      );
    }
    
    // Get the archive by ID
    const archive = await getItemById(id);
    
    if (!archive) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Archive not found' 
        },
        { status: 404 }
      );
    }
    
    // Check if the archive is public or belongs to the current user
    // (The getItemById function already handles this check)
    
    // Return the archive details
    return NextResponse.json({ 
      success: true, 
      archive 
    });
  } catch (error) {
    console.error('Error fetching archive details:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch archive details' 
      },
      { status: 500 }
    );
  }
} 