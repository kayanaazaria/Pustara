// Insert sample Indonesian books with new schema
require('dotenv').config();
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
const client = new Client({ connectionString });

async function insertBooks() {
  try {
    await client.connect();
    console.log('✓ Connected to Neon database');

    const insertQuery = `
      INSERT INTO books (title, authors, genres, description, cover_url, "year", pages, language, avg_rating, rating_count, total_stock, available)
      VALUES
        ('Laskar Pelangi', ARRAY['Andrea Hirata'], ARRAY['Fiction'], 'Kisah inspiratif tentang sepuluh anak sekolah di Belitung yang berjuang mengejar mimpi mereka.', 'https://via.placeholder.com/150', 2005, 534, 'id', 4.8, 1250, 5, 5),
        ('Bumi Manusia', ARRAY['Pramoedya Ananta Toer'], ARRAY['Historical Fiction'], 'Novel pertama dari tetralogi Pulau Buru yang menceritakan perjuangan Minke melawan kolonialisme Belanda.', 'https://via.placeholder.com/150', 1980, 540, 'id', 4.7, 980, 5, 5),
        ('Cantik Itu Luka', ARRAY['Eka Kurniawan'], ARRAY['Fiction'], 'Novel yang menceritakan kisah Dewi Lestari dan penggalan hidupnya di tengah revolusi sosial Indonesia.', 'https://via.placeholder.com/150', 2002, 384, 'id', 4.6, 850, 5, 5),
        ('Perahu Kertas', ARRAY['Dee Lestari'], ARRAY['Romance'], 'Cerita cinta Kugy dan Kara yang bergerak antara cita-cita besar dan kenapa cinta tidak selalu berakhir bahagia.', 'https://via.placeholder.com/150', 2009, 392, 'id', 4.5, 1100, 5, 5),
        ('Negeri 5 Menara', ARRAY['Ahmad Fuadi'], ARRAY['Coming of Age'], 'Kisah transformasi seorang pemuda dari Minangkabau yang mencari identitas dan mimpinya di pesantren.', 'https://via.placeholder.com/150', 2009, 468, 'id', 4.7, 1350, 5, 5),
        ('Ayah', ARRAY['Andrea Hirata'], ARRAY['Fiction'], 'Dilanjutkan dari Laskar Pelangi, cerita tentang guru Ibnu Hajar dan kehidupan di Belitung.', 'https://via.placeholder.com/150', 2010, 408, 'id', 4.6, 920, 5, 5),
        ('Rumah Doa', ARRAY['Oka Rusmini'], ARRAY['Historical Fiction'], 'Epik yang bercerita tentang kehidupan keluarga dalam tradisi Hindu Bali dalam kurun waktu tiga generasi.', 'https://via.placeholder.com/150', 2004, 448, 'id', 4.5, 650, 5, 5),
        ('Layar Terkembang', ARRAY['Sutan Takdir Alisjahbana'], ARRAY['Fiction'], 'Novel klasik yang mengutarakan pembaharuan dan pencerahan dalam budaya Indonesia modern.', 'https://via.placeholder.com/150', 1937, 256, 'id', 4.4, 580, 5, 5),
        ('Si Anak Pejantan', ARRAY['Pramoedya Ananta Toer'], ARRAY['Fiction'], 'Novelet yang menceritakan tentang seorang anak laki-laki yang berusaha menemukan jati dirinya.', 'https://via.placeholder.com/150', 1958, 120, 'id', 4.3, 420, 5, 5),
        ('Saman', ARRAY['Ayu Utami'], ARRAY['Fiction'], 'Novel eksperimental yang menceritakan kehidupan empat perempuan dengan gaya naratif yang unik.', 'https://via.placeholder.com/150', 1998, 384, 'id', 4.4, 710, 5, 5)
    `;

    const result = await client.query(insertQuery);
    console.log(`\n✓ Inserted ${result.rowCount} books`);

    // Verify data
    const countResult = await client.query('SELECT COUNT(*) as total FROM books');
    console.log(`✓ Total books in database: ${countResult.rows[0].total}`);

    // Show all books
    const books = await client.query('SELECT id, title, authors, genres FROM books ORDER BY id LIMIT 5');
    console.log('\n📚 Sample books in database:');
    books.rows.forEach(book => {
      console.log(`   - ${book.title}`);
      console.log(`     Authors: ${book.authors.join(', ')}`);
      console.log(`     Genres: ${book.genres.join(', ')}`);
    });

    console.log('\n✅ Books data inserted successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

insertBooks();
