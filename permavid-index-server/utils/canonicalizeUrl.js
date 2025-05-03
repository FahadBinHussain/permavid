/**
 * Converts a video/post URL into a canonical identifier format (e.g., platform:videoId or platform:postId).
 * Supports YouTube, Facebook (Reels, Watch, Videos), and Instagram Posts.
 *
 * @param {string} url The URL to canonicalize.
 * @returns {string | null} The canonical identifier string or null if the URL is not recognized or invalid.
 */
function getCanonicalIdentifier(url) {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname;

    // === YouTube ===
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      let videoId = null;

      if (hostname.includes('youtube.com')) {
        if (pathname.startsWith('/shorts/')) {
          videoId = pathname.split('/')[2]; // Get the part after /shorts/
        } else {
          videoId = parsedUrl.searchParams.get('v');
        }
      } else if (hostname.includes('youtu.be')) {
        videoId = pathname.split('/').pop();
      }

      if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) { // Basic validation
        return `youtube:${videoId}`;
      }
    }

    // === Facebook ===
    if (hostname.includes('facebook.com') || hostname.includes('fb.watch')) {
      let videoId = null;
      
      // Handle fb.watch links (need to resolve redirect, but often contain ID)
      // Basic check for fb.watch structure might be needed if we don't resolve
      // For now, focus on standard facebook.com links

      // Regex for /reel/12345 or /videos/12345
      const reelOrVideoMatch = pathname.match(/\/(?:reel|videos)\/(\d+)/);
      if (reelOrVideoMatch && reelOrVideoMatch[1]) {
        videoId = reelOrVideoMatch[1];
      }

      // Check for /watch/?v=12345
      if (!videoId && pathname.includes('/watch')) {
        videoId = parsedUrl.searchParams.get('v');
      }
      
      // Check for common video URL pattern like /username/videos/123456...
      if (!videoId && pathname.includes('/videos/')) {
          const parts = pathname.split('/');
          // Find the last part that is purely numeric
          for (let i = parts.length - 1; i >= 0; i--) {
              if (/^\d+$/.test(parts[i])) {
                  videoId = parts[i];
                  break;
              }
          }
      }

      if (videoId && /^\d+$/.test(videoId)) { // Basic validation for FB IDs (numeric)
        return `facebook:${videoId}`;
      }
    }

    // === Instagram ===
    if (hostname.includes('instagram.com')) {
      // Match /p/POST_ID/ or /reel/POST_ID/
      const postMatch = pathname.match(/\/(?:p|reel)\/([a-zA-Z0-9_-]+)/);
      if (postMatch && postMatch[1]) {
        const postId = postMatch[1];
        // Basic validation for Instagram post IDs (alphanumeric, _, -)
        if (/^[a-zA-Z0-9_-]+$/.test(postId)) {
          return `instagram:${postId}`;
        }
      }
    }

    // TODO: Add support for other platforms (Vimeo, etc.) here

  } catch (e) {
    // Invalid URL format
    console.error(`Error parsing URL for canonicalization: ${url}`, e);
    return null;
  }

  // URL didn't match any known patterns
  console.warn(`Canonicalization failed: URL did not match known patterns: ${url}`);
  return null;
}

module.exports = { getCanonicalIdentifier }; 