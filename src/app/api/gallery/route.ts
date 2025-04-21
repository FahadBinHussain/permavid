import { NextResponse } from 'next/server';
import { getEncodedItems } from '@/lib/queue';

export async function GET(request: Request) {
  try {
    const encodedItems = getEncodedItems();
    return NextResponse.json(encodedItems);
  } catch (error: any) {
    console.error('API: Error fetching encoded items:', error);
    return NextResponse.json({ error: 'Failed to fetch encoded items gallery' }, { status: 500 });
  }
} 