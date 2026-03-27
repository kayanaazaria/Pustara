// Check existing books table structure dan insert data sesuai kolom
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_5sJYwuacST0b@ep-super-shadow-a8ljl9n1-pooler.eastus2.azure.neon.tech/neondb?sslmode=require&channel_binding=require';

const client = new Client({
  connectionString,
});

async function insertBooks() {
  try {
    await client.connect();
    console.log('✓ Connected to Neon database');

    // Get table structure
    const tableInfo = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'books'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Books table structure:');
    tableInfo.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });

    // Insert sample books sesuai kolom yang ada
    const insertQuery = `
      INSERT INTO books (title, authors, description, pdf_url, published_year, pages, language, rating, reviews_count)
      VALUES
        ('Laskar Pelangi', 'Andrea Hirata', 'Kisah inspiratif tentang sepuluh anak sekolah di Belitung yang berjuang mengejar mimpi mereka.', 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf', 2005, 534, 'Indonesian', 4.8, 1250),
        ('Bumi Manusia', 'Pramoedya Ananta Toer', 'Novel pertama dari tetralogi Pulau Buru yang menceritakan perjuangan Minke melawan kolonialisme Belanda.', 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf', 1980, 540, 'Indonesian', 4.7, 980),
        ('Cantik Itu Luka', 'Eka Kurniawan', 'Novel yang menceritakan kisah Dewi Lestari dan penggalan hidupnya di tengah revolusi sosial Indonesia.', 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf', 2002, 384, 'Indonesian', 4.6, 850),
        ('Perahu Kertas', 'Dee Lestari', 'Cerita cinta Kugy dan Kara yang bergerak antara cita-cita besar dan kenapa cinta tidak selalu berakhir bahagia.', 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf', 2009, 392, 'Indonesian', 4.5, 1100),
        ('Negeri 5 Menara', 'Ahmad Fuadi', 'Kisah transformasi seorang pemuda dari Minangkabau yang mencari identitas dan mimpinya di pesantren.', 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf', 2009, 468, 'Indonesian', 4.7, 1350),
        ('Ayah', 'Andrea Hirata', 'Dilanjutkan dari Laskar Pelangi, cerita tentang guru Ibnu Hajar dan kehidupan di Belitung.', 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf', 2010, 408, 'Indonesian', 4.6, 920),
        ('Rumah Doa', 'Oka Rusmini', 'Epik yang bercerita tentang kehidupan keluarga dalam tradisi Hindu Bali dalam kurun waktu tiga generasi.', 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf', 2004, 448, 'Indonesian', 4.5, 650),
        ('Layar Terkembang', 'Sutan Takdir Alisjahbana', 'Novel klasik yang mengutarakan pembaharuan dan pencerahan dalam budaya Indonesia modern.', 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf', 1937, 256, 'Indonesian', 4.4, 580),
        ('Si Anak Pejantan', 'Pramoedya Ananta Toer', 'Novelet yang menceritakan tentang seorang anak laki-laki yang berusaha menemukan jati dirinya.', 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf', 1958, 120, 'Indonesian', 4.3, 420),
        ('Saman', 'Ayu Utami', 'Novel eksperimental yang menceritakan kehidupan empat perempuan dengan gaya naratif yang unik.', 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf', 1998, 384, 'Indonesian', 4.4, 710)
      ON CONFLICT DO NOTHING
    `;

    const result = await client.query(insertQuery);
    console.log(`\n✓ Inserted ${result.rowCount} books`);

    // Verify data
    const countResult = await client.query('SELECT COUNT(*) as total FROM books');
    console.log(`✓ Total books in database: ${countResult.rows[0].total}`);

    // Show all books
    const books = await client.query('SELECT id, title, authors FROM books ORDER BY id');
    console.log('\n📚 Books in database:');
    books.rows.forEach(book => {
      console.log(`   #${book.id}: ${book.title} by ${book.authors}`);
    });

    console.log('\n✅ Books data setup completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

insertBooks();
