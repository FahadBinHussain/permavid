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
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ message: 'URL is required.' });
  }

  const canonicalIdentifier = getCanonicalIdentifier(url);

  if (!canonicalIdentifier) {
    return res.status(400).json({ message: 'Invalid or unsupported URL format.' });
  }

  try {
    await prisma.archivedIdentifier.create({
      data: { canonicalIdentifier },
    });
    return res.status(201).json({ message: 'Identifier added.' });
  } catch (e) {
    // Check if it's a unique constraint violation (P2002 for Prisma)
    if (e.code === 'P2002') {
      // If it already exists, it's not an error for this endpoint's purpose
      return res.status(200).json({ message: 'Identifier already exists.' });
    } else {
      console.error('Failed to add identifier:', e);
      return res.status(500).json({ message: 'Server error while adding identifier.' });
    }
  }
}; 