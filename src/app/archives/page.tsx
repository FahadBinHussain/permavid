'use client';

import { useState, useEffect } from 'react';
import { QueueItem } from '@/lib/queue';
import Link from 'next/link';
import Archives from '@/components/Archives';

export default function ArchivesPage() {
  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Video Archives</h1>
        <Link href="/" className="text-blue-500 hover:underline">
          Back to Home
        </Link>
      </div>
      
      <div className="bg-white shadow rounded-lg p-6">
        <p className="mb-6 text-gray-600">
          Browse all archived videos. These videos have been preserved by PermaVid users.
        </p>
        
        <Archives />
      </div>
    </div>
  )
} 