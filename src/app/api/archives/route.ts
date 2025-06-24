import { NextRequest, NextResponse } from 'next/server';
import { getEncodedItems } from '@/lib/queue';

/**
 * API endpoint to get all archives from the database
 */
export async function GET(request: NextRequest) {
  try {
    // Get all encoded items from the database
    const archives = await getEncodedItems();
    
    // Return the archives
    return NextResponse.json({ 
      success: true, 
      archives: archives 
    });
  } catch (error) {
    console.error('Error fetching archives:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch archives' 
      },
      { status: 500 }
    );
  }
} 