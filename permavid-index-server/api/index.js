const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Load environment variables
const { PrismaClient } = require('../prisma/generated/prisma'); // Updated import path
const { getCanonicalIdentifier } = require('../utils/canonicalizeUrl'); // Import canonicalization function

const prisma = new PrismaClient(); // Instantiate Prisma Client

const app = express();
const PORT = process.env.PORT || 3001; // Use environment variable or default

// Middleware
app.use(cors()); // Enable CORS for all origins
app.use(express.json()); // Parse JSON bodies

// Basic route
app.get('/', (req, res) => {
  res.send('PermaVid Index Server API endpoint is running!');
});

// Placeholder routes (to be implemented later)
app.post('/add', (req, res) => {
  res.status(501).send({ message: 'Not Implemented' });
});

app.get('/check', (req, res) => {
  res.status(501).send({ message: 'Not Implemented' });
});

// --- API Routes ---

// POST /add - Add an identifier
app.post('/add', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).send({ message: 'URL is required.' });
  }

  const canonicalIdentifier = getCanonicalIdentifier(url);

  if (!canonicalIdentifier) {
    return res.status(400).send({ message: 'Invalid or unsupported URL format.' });
  }

  try {
    await prisma.archivedIdentifier.create({
      data: { canonicalIdentifier },
    });
    res.status(201).send({ message: 'Identifier added.' });
  } catch (e) {
    // Check if it's a unique constraint violation (P2002 for Prisma)
    if (e.code === 'P2002') {
      // If it already exists, it's not an error for this endpoint's purpose
      res.status(200).send({ message: 'Identifier already exists.' });
    } else {
      console.error('Failed to add identifier:', e);
      res.status(500).send({ message: 'Server error while adding identifier.' });
    }
  }
});

// GET /check - Check if an identifier exists
app.get('/check', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send({ message: 'URL query parameter is required.' });
  }

  const canonicalIdentifier = getCanonicalIdentifier(url);

  if (!canonicalIdentifier) {
    // If the URL is invalid/unsupported, we can say it's not found
    return res.status(200).send({ found: false, message: 'Invalid or unsupported URL format.' });
  }

  try {
    const result = await prisma.archivedIdentifier.findUnique({
      where: { canonicalIdentifier },
    });
    res.status(200).send({ found: !!result }); // Convert result object/null to boolean
  } catch (e) {
    console.error('Failed to check identifier:', e);
    res.status(500).send({ message: 'Server error while checking identifier.' });
  }
});

// Start the server only if not running on Vercel (Vercel handles this)
if (!process.env.VERCEL_ENV) {
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
}

// Export the app for Vercel
module.exports = app; 