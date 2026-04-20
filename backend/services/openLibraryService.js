/**
 * OpenLibrary Service - Fetch book metadata and covers by ISBN
 * API Docs: https://openlibrary.org/api/books
 */

const OPENLIBRARY_API = 'https://openlibrary.org';
const OPENLIBRARY_BOOKS_API = 'https://openlibrary.org/api/books';

/**
 * Fetch book data from OpenLibrary by ISBN
 * Returns: { title, author, pages, publish_date, cover_id, ... }
 */
async function fetchBookByISBN(isbn) {
  try {
    if (!isbn || isbn.trim().length === 0) {
      console.log('[OpenLibrary] Empty ISBN provided');
      return null;
    }

    // Clean ISBN (remove hyphens, spaces)
    const cleanISBN = isbn.replace(/[-\s]/g, '');
    const url = `${OPENLIBRARY_BOOKS_API}?bibkeys=ISBN:${cleanISBN}&jscmd=data&format=json`;
    
    console.log(`[OpenLibrary] 🔍 Fetching cover for ISBN: ${isbn} (cleaned: ${cleanISBN})`);
    console.log(`[OpenLibrary] 📡 Request URL: ${url}`);

    const res = await fetch(url, { timeout: 10000 }); // Increased to 10s
    
    console.log(`[OpenLibrary] ✅ Response status: ${res.status}`);

    if (!res.ok) {
      console.warn(`[OpenLibrary] ❌ HTTP ${res.status}: ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const bookKey = Object.keys(data)[0];

    if (!bookKey) {
      console.warn(`[OpenLibrary] ⚠️  ISBN NOT FOUND on OpenLibrary: ${isbn}`);
      console.log(`[OpenLibrary] 💡 Tip: This ISBN doesn't exist on OpenLibrary, or you can manually add it via openlibrary.org`);
      return null;
    }

    const book = data[bookKey];
    console.log(`[OpenLibrary] 📖 Found book: "${book.title}"`);
    
    if (!book.cover_id) {
      console.warn(`[OpenLibrary] ⚠️  Book found but NO COVER IMAGE in OpenLibrary database`);
      console.warn(`[OpenLibrary] 📚 Book: ${book.title}`);
      console.warn(`[OpenLibrary] 💡 Workaround: Manually upload cover to OpenLibrary or use placeholder`);
    } else {
      console.log(`[OpenLibrary] 🖼️  Cover ID found: ${book.cover_id}`);
    }

    const result = {
      isbn: cleanISBN,
      title: book.title || null,
      authors: book.authors?.map(a => a.name) || [],
      pages: book.number_of_pages || null,
      publish_year: book.publish_date ? parseInt(book.publish_date.split('-')[0]) : null,
      publishers: book.publishers || [],
      cover_id: book.cover_id || null,
      description: book.description || null,
      languages: book.languages?.map(l => l.key.replace('/languages/', '')) || []
    };
    
    return result;
  } catch (error) {
    console.error(`[OpenLibrary] ❌ Error fetching for ISBN ${isbn}:`, error.message);
    return null;
  }
}

/**
 * Get cover image URL from OpenLibrary by cover ID
 * Sizes: S (small), M (medium), L (large)
 */
function getCoverUrl(coverId, size = 'M') {
  if (!coverId) return null;
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

/**
 * Fetch cover image by ISBN (shortcut)
 */
async function fetchCoverByISBN(isbn, size = 'M') {
  const bookData = await fetchBookByISBN(isbn);
  if (!bookData || !bookData.cover_id) {
    return null;
  }
  return getCoverUrl(bookData.cover_id, size);
}

module.exports = {
  fetchBookByISBN,
  getCoverUrl,
  fetchCoverByISBN
};
