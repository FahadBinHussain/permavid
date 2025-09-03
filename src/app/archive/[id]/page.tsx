"use client";

import { useState, useEffect } from "react";
import { QueueItem } from "@/lib/queue";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function ArchivePage() {
  const { id } = useParams();
  const [archive, setArchive] = useState<QueueItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchArchive() {
      try {
        const response = await fetch(`/api/archives/${id}`);
        const data = await response.json();

        if (data.success) {
          setArchive(data.archive);
        } else {
          setError(data.error || "Failed to fetch archive");
        }
      } catch (err) {
        setError("Error fetching archive");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchArchive();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Archive Details</h1>
        <p>Loading archive details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Archive Details</h1>
        <p className="text-red-500">{error}</p>
        <Link
          href="/"
          className="text-blue-500 hover:underline mt-4 inline-block"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  if (!archive) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Archive Details</h1>
        <p>Archive not found.</p>
        <Link
          href="/"
          className="text-blue-500 hover:underline mt-4 inline-block"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Archive Details</h1>

      <div className="bg-white shadow rounded-lg p-6">
        {archive.thumbnail_url && (
          <div className="mb-4">
            <img
              src={archive.thumbnail_url}
              alt={archive.title || "Video thumbnail"}
              className="w-full max-h-64 object-cover rounded"
            />
          </div>
        )}

        <h2 className="text-xl font-semibold mb-2">
          {archive.title || "Untitled"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <h3 className="font-medium text-gray-700">Status</h3>
            <p className="mt-1">
              <span
                className={`px-2 py-1 rounded text-sm ${
                  archive.status === "completed" || archive.status === "encoded"
                    ? "bg-green-100 text-green-800"
                    : archive.status === "failed"
                      ? "bg-red-100 text-red-800"
                      : "bg-blue-100 text-blue-800"
                }`}
              >
                {archive.status}
              </span>
            </p>
          </div>

          <div>
            <h3 className="font-medium text-gray-700">Added</h3>
            <p className="mt-1">
              {new Date(archive.added_at).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <h3 className="font-medium text-gray-700">URL</h3>
          <a
            href={archive.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline break-all"
          >
            {archive.url}
          </a>
        </div>

        {archive.filemoon_url && (
          <div className="mb-4">
            <h3 className="font-medium text-gray-700">Filemoon URL</h3>
            <a
              href={archive.filemoon_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline break-all"
            >
              {archive.filemoon_url}
            </a>
          </div>
        )}

        {archive.message && (
          <div className="mb-4">
            <h3 className="font-medium text-gray-700">Message</h3>
            <p className="mt-1 text-gray-600">{archive.message}</p>
          </div>
        )}
      </div>

      <Link
        href="/"
        className="text-blue-500 hover:underline mt-4 inline-block"
      >
        Back to Home
      </Link>
    </div>
  );
}
