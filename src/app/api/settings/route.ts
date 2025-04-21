import { NextRequest, NextResponse } from 'next/server';
import { 
    getAllSettings, 
    setSetting, 
    getSetting // Import getSetting if needed for specific gets, but getAll is usually enough
} from '@/lib/settings';

// GET request to fetch all current settings
export async function GET(request: NextRequest) {
  try {
    const settings = getAllSettings();
    console.log('API: Fetched settings', settings);
    return NextResponse.json(settings);
  } catch (error: any) {
    console.error('API: Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// POST request to update settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('API: Received settings update request:', body);

    // Iterate through the keys in the request body and update settings
    let updateErrors: string[] = [];
    for (const key in body) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
            const value = body[key];
            // Basic validation: ensure value is a string or boolean (convert boolean to string)
            let valueToSet: string;
            if (typeof value === 'boolean') {
                valueToSet = value ? 'true' : 'false';
            } else if (typeof value === 'string') {
                valueToSet = value;
            } else {
                console.warn(`API: Invalid type for setting ${key}. Expected string or boolean, got ${typeof value}. Skipping.`);
                updateErrors.push(`Invalid type for setting: ${key}`);
                continue; // Skip this key
            }

            const result = setSetting(key, valueToSet);
            if (!result.success) {
                updateErrors.push(`Failed to set ${key}: ${result.message}`);
            }
        }
    }

    if (updateErrors.length > 0) {
        console.error('API: Errors occurred during settings update:', updateErrors);
        // Return a 400 Bad Request if there were specific setting errors
        return NextResponse.json({ error: 'One or more settings failed to update.', details: updateErrors }, { status: 400 });
    }

    // Fetch updated settings to return them
    const updatedSettings = getAllSettings();
    return NextResponse.json({ message: 'Settings updated successfully', settings: updatedSettings });

  } catch (error: any) {
    console.error('API: Error processing settings update:', error);
    if (error instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error during settings update' }, { status: 500 });
  }
} 