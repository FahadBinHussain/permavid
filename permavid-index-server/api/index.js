// Export a serverless function handler
module.exports = (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Return API information
  return res.status(200).json({
    message: 'PermaVid Index Server API is running!',
    endpoints: [
      {
        method: 'GET',
        path: '/api/check',
        description: 'Check if a video URL exists in the index',
        query: { url: 'string' }
      },
      {
        method: 'POST',
        path: '/api/add',
        description: 'Add a video URL to the index',
        body: { url: 'string' }
      }
    ]
  });
}; 