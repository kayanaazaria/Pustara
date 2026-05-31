const { URL } = require('url');
const { executeQuery, isNeon } = require('../config/database');

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

/**
 * Serve avatar for a given user id (database id).
 * Returns image bytes proxied from storage so the original storage URL is never exposed.
 */
exports.avatarById = async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, message: 'missing id' });

    const table = isNeon ? 'users' : 'Users';
    // Select all columns to avoid errors if some column names don't exist in the schema
    const rows = await executeQuery(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    const row = rows && rows[0] ? rows[0] : null;
    let avatarUrl = null;
    const avatarPath = row && (row.avatar_path || row.avatarPath) ? String(row.avatar_path || row.avatarPath).trim() : null;
    if (avatarPath) {
      // If avatar_path appears to be a full URL, use it. Otherwise, construct Supabase storage URL
      if (/^https?:\/\//i.test(avatarPath)) {
        avatarUrl = avatarPath;
      } else {
        const supabaseUrl = process.env.SUPABASE_URL || null;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
        if (supabaseUrl) {
          let filePath = avatarPath.replace(/^\//, '');
          if (filePath.startsWith('storage/v1/object/')) {
            avatarUrl = `${supabaseUrl.replace(/\/$/, '')}/${filePath}`;
          } else {
            // Assume it's a relative path inside the pustara-storage bucket
            if (filePath.startsWith('pustara-storage/')) {
              filePath = filePath.replace(/^pustara-storage\//, '');
            }
            avatarUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/pustara-storage/${filePath}`;
          }
          // attach serviceKey header when fetching later
          req._pustara_avatar_service_key = serviceKey;
        }
      }
    }

    if (!avatarUrl) {
      const candidate = row && (row.avatar_url || row.avatarUrl || row.photoURL || row.photo_url || row.photourl) ? String(row.avatar_url || row.avatarUrl || row.photoURL || row.photo_url || row.photourl) : null;
      avatarUrl = candidate;
    }
    if (!avatarUrl) return res.status(404).json({ success: false, message: 'Avatar not found' });

    // Handle data: URLs quickly
    if (/^data:/i.test(avatarUrl)) {
      const match = avatarUrl.match(/^data:([^;]+);base64,(.*)$/i);
      if (!match) return res.status(400).json({ success: false, message: 'Unsupported data url' });
      const contentType = match[1] || 'application/octet-stream';
      const buffer = Buffer.from(match[2], 'base64');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(buffer);
    }

    let parsed;
    try {
      parsed = new URL(avatarUrl);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid avatar url' });
    }

    // Only allow fetching from allowed hosts
    if (!['http:', 'https:'].includes(parsed.protocol) || !isAllowedMediaHost(parsed.hostname)) {
      return res.status(403).json({ success: false, message: 'Avatar host not allowed' });
    }

    const fetchHeaders = { 'User-Agent': 'PustaraAvatarProxy/1.0' };
    // If a Supabase service key was stored on the request earlier, use it for auth
    if (req._pustara_avatar_service_key) {
      fetchHeaders['Authorization'] = `Bearer ${req._pustara_avatar_service_key}`;
    }

    console.log('Fetching avatar URL:', parsed.toString(), 'useServiceKey=', Boolean(req._pustara_avatar_service_key));
    const response = await fetch(parsed.toString(), {
      headers: fetchHeaders,
    });

    if (!response.ok || !response.body) {
      return res.status(502).json({ success: false, message: 'Failed to fetch avatar' });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const cacheControl = response.headers.get('cache-control') || 'public, max-age=86400';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('Error serving avatar by id:', error?.message || error);
    return res.status(500).json({ success: false, message: 'Failed to serve avatar' });
  }
};