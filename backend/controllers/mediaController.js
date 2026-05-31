const { URL } = require('url');

const ALLOWED_HOST_SUFFIXES = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'lh3.googleusercontent.com',
  'googleusercontent.com',
  'googleapis.com',
  'supabase.co',
  'openlibrary.org',
];

function isAllowedMediaHost(hostname) {
  const lowerHost = String(hostname || '').toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => lowerHost === suffix || lowerHost.endsWith(`.${suffix}`));
}

exports.proxyMedia = async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ success: false, message: 'url query is required' });
    }

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid media url' });
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || !isAllowedMediaHost(parsed.hostname)) {
      return res.status(403).json({ success: false, message: 'Media host not allowed' });
    }

    const response = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'PustaraMediaProxy/1.0',
      },
    });

    if (!response.ok || !response.body) {
      return res.status(502).json({ success: false, message: 'Failed to fetch media' });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const cacheControl = response.headers.get('cache-control') || 'public, max-age=86400, stale-while-revalidate=604800';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('Error serving media proxy:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to serve media' });
  }
};