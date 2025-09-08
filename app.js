const express = require('express');
const bodyParser = require('body-parser');
const { DateTime } = require('luxon');
const { Log } = require('./loggingMiddleware');

const app = express();
const port = process.env.PORT || 3000;
const urlStore = {};   // In-memory store

app.use(express.json ? express.json() : bodyParser.json());

// Utility functions
function generateShortcode(length = 6) {
  const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  while (true) {
    let shortcode = '';
    for (let i = 0; i < length; i++) {
      shortcode += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    if (!urlStore[shortcode]) {
      return shortcode;
    }
  }
}

function isValidUrl(url) {
  return /^(http|https):\/\/[^ "]+$/.test(url);
}

function isExpired(expiryDate) {
  return DateTime.now().toUTC() > DateTime.fromISO(expiryDate);
}

// ---------- Routes ----------

// Create short URL
app.post('/shorturls', async (req, res) => {
  const { url, validity, shortcode: customShortcode } = req.body;

  if (!url) {
    await Log('backend', 'error', 'route', 'Missing required field: url');
    return res.status(400).json({ error: 'Missing required field: url' });
  }

  if (!isValidUrl(url)) {
    await Log('backend', 'error', 'route', `Invalid URL format: ${url}`);
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  let validityMinutes = validity ?? 30;

  if (typeof validityMinutes === 'string' && validityMinutes.trim() !== '') {
    validityMinutes = Number(validityMinutes);
  }
  if (!Number.isInteger(validityMinutes) || validityMinutes <= 0) {
    await Log('backend', 'error', 'route', `Invalid validity: ${validityMinutes} (must be positive integer)`);
    return res.status(400).json({ error: 'Validity must be a positive integer' });
  }

  let shortcode = customShortcode;
  if (shortcode) {
    if (!/^[a-zA-Z0-9]{4,20}$/.test(shortcode)) {
      await Log('backend', 'error', 'route', `Invalid custom shortcode: ${shortcode}`);
      return res.status(400).json({ error: 'Shortcode must be alphanumeric and 4-20 characters long' });
    }
    if (urlStore[shortcode]) {
      await Log('backend', 'error', 'route', `Shortcode already in use: ${shortcode}`);
      return res.status(409).json({ error: 'Shortcode already in use' });
    }
  } else {
    shortcode = generateShortcode();
    await Log('backend', 'info', 'route', `Generated unique shortcode: ${shortcode}`);
  }

  const creationDate = DateTime.now().toUTC();
  const expiryDate = creationDate.plus({ minutes: validityMinutes }).toISO();

  urlStore[shortcode] = {
    originalUrl: url,
    creationDate: creationDate.toISO(),
    expiryDate,
    clicks: []
  };

  const host = req.protocol + '://' + req.get('host');
  const shortLink = `${host}/${shortcode}`;

  await Log('backend', 'info', 'route', `Created short URL: ${shortLink} for ${url}, expires at ${expiryDate}`);
  res.status(201).json({ shortLink, expiry: expiryDate });
});

// ---------- FIX: Stats before redirect ----------

// Stats for one shortcode
app.get('/shorturls/:shortcode', async (req, res) => {
  const { shortcode } = req.params;

  if (!urlStore[shortcode]) {
    await Log('backend', 'error', 'route', `Non-existent shortcode for stats: ${shortcode}`);
    return res.status(404).json({ error: 'Shortcode not found' });
  }

  const entry = urlStore[shortcode];
  const totalClicks = entry.clicks.length;

  const stats = {
    totalClicks,
    originalUrl: entry.originalUrl,
    creationDate: entry.creationDate,
    expiryDate: entry.expiryDate,
    clicks: entry.clicks
  };

  await Log('backend', 'info', 'route', `Retrieved stats for shortcode: ${shortcode}`);
  res.status(200).json(stats);
});

// List all short URLs
app.get('/shorturls', async (req, res) => {
  const all = Object.entries(urlStore).map(([code, entry]) => ({
    shortcode: code,
    originalUrl: entry.originalUrl,
    creationDate: entry.creationDate,
    expiryDate: entry.expiryDate,
    totalClicks: entry.clicks.length
  }));

  await Log('backend', 'info', 'route', 'Retrieved all short URLs');
  res.status(200).json(all);
});

// Redirect
app.get('/:shortcode', async (req, res) => {
  const { shortcode } = req.params;

  if (!urlStore[shortcode]) {
    await Log('backend', 'error', 'route', `Non-existent shortcode accessed: ${shortcode}`);
    return res.status(404).json({ error: 'Shortcode not found' });
  }

  const entry = urlStore[shortcode];
  if (isExpired(entry.expiryDate)) {
    await Log('backend', 'warn', 'route', `Expired shortcode accessed: ${shortcode}`);
    return res.status(410).json({ error: 'Link has expired' });
  }

  const geo = 'US';
  const referrer = req.get('Referer') || 'Direct';
  const timestamp = DateTime.now().toUTC().toISO();

  entry.clicks.push({ timestamp, referrer, geo });

  await Log('backend', 'info', 'route', `Click recorded for ${shortcode}`);
  res.redirect(302, entry.originalUrl);
});

// Global error handler
app.use(async (err, req, res, next) => {
  await Log('backend', 'fatal', 'handler', `Unhandled error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, async () => {
  await Log('backend', 'info', 'route', `Server started on port ${port}`);
  console.log(`Server running on port ${port}`);
});
