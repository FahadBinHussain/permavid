const { PrismaClient } = require('@prisma/client');
const { getCanonicalIdentifier } = require('../utils/canonicalizeUrl');
require('dotenv').config();

// Create Prisma client instance
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Export a serverless function handler
module.exports = async (req, res) => {
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

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ message: 'URL query parameter is required.' });
  }

  const canonicalIdentifier = getCanonicalIdentifier(url);

  if (!canonicalIdentifier) {
    // If the URL is invalid/unsupported, we can say it's not found
    return res.status(200).json({ found: false, message: 'Invalid or unsupported URL format.' });
  }

  try {
    const result = await prisma.archivedIdentifier.findUnique({
      where: { canonicalIdentifier },
    });
    return res.status(200).json({ found: !!result }); // Convert result object/null to boolean
  } catch (e) {
    console.error('Failed to check identifier:', e);
    return res.status(500).json({ message: 'Server error while checking identifier.' });
  }
}; 