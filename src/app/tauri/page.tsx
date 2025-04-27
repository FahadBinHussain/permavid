'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TauriPage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="text-center p-8 bg-white rounded-lg shadow-md">
        <div className="animate-spin h-8 w-8 mx-auto mb-4 border-4 border-indigo-600 rounded-full border-t-transparent"></div>
        <h1 className="text-2xl font-bold mb-2">Loading PermaVid...</h1>
        <p className="text-gray-600">Please wait while the application initializes</p>
      </div>
    </div>
  );
} 