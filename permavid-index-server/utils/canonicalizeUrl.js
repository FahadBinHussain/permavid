/**
 * Converts a video URL into a canonical identifier format (e.g., platform:videoId).
 * Currently supports common YouTube formats.
 *
 * @param {string} url The video URL to canonicalize.
 * @returns {string | null} The canonical identifier string or null if the URL is not recognized or invalid.
 */
function getCanonicalIdentifier(url) {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // YouTube
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      let videoId = null;

      if (hostname.includes('youtube.com')) {
        videoId = parsedUrl.searchParams.get('v');
      }

      if (!videoId && hostname.includes('youtu.be')) {
        videoId = parsedUrl.pathname.split('/').pop();
      }

      if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) { // Basic validation for YouTube IDs
        return `youtube:${videoId}`;
      }
    }

    // TODO: Add support for other platforms (Vimeo, Facebook, etc.) here

  } catch (e) {
    // Invalid URL format
    console.error(`Error parsing URL for canonicalization: ${url}`, e);
    return null;
  }

  // URL didn't match any known patterns
  return null;
}

module.exports = { getCanonicalIdentifier }; 