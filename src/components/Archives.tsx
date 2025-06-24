import { useState, useEffect } from 'react';
import { QueueItem } from '@/lib/queue';

export default function Archives() {
  const [archives, setArchives] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchArchives() {
      try {
        const response = await fetch('/api/archives');
        const data = await response.json();
        
        if (data.success) {
          setArchives(data.archives);
        } else {
          setError(data.error || 'Failed to fetch archives');
        }
      } catch (err) {
        setError('Error fetching archives');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchArchives();
  }, []);

  if (loading) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Video Archives</h2>
        <p>Loading archives...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Video Archives</h2>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (archives.length === 0) {
    return (
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">Video Archives</h2>
        <p>No archives found.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Video Archives</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {archives.map((archive) => (
          <div key={archive.id} className="border rounded-lg p-4 shadow-sm">
            {archive.thumbnail_url && (
              <img 
                src={archive.thumbnail_url} 
                alt={archive.title || 'Video thumbnail'} 
                className="w-full h-32 object-cover mb-2 rounded"
              />
            )}
            <h3 className="font-semibold text-lg truncate">{archive.title || 'Untitled'}</h3>
            <p className="text-sm text-gray-500 truncate">{archive.url}</p>
            <div className="mt-2 flex justify-between items-center">
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                {archive.status}
              </span>
              <a 
                href={`/archive/${archive.id}`} 
                className="text-blue-500 hover:underline text-sm"
              >
                View Details
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 