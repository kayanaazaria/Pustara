-- Create books table for Neon PostgreSQL
CREATE TABLE IF NOT EXISTS books (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  authors VARCHAR(255) NOT NULL,
  description TEXT,
  genre VARCHAR(100),
  cover_url VARCHAR(500),
  pdf_url VARCHAR(500),
  isbn VARCHAR(20),
  published_year INT,
  pages INT,
  language VARCHAR(50) DEFAULT 'Indonesian',
  rating DECIMAL(3,2) DEFAULT 0,
  reviews_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample Indonesian books
INSERT INTO books (title, authors, description, genre, pdf_url, published_year, pages, language, rating, reviews_count) VALUES
(
  'Laskar Pelangi',
  'Andrea Hirata',
  'Kisah inspiratif tentang sepuluh anak sekolah di Belitung yang berjuang mengejar mimpi mereka.',
  'Fiction',
  'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf',
  2005,
  534,
  'Indonesian',
  4.8,
  1250
),
(
  'Bumi Manusia',
  'Pramoedya Ananta Toer',
  'Novel pertama dari tetralogi Pulau Buru yang menceritakan perjuangan Minke melawan kolonialisme Belanda.',
  'Historical Fiction',
  'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf',
  1980,
  540,
  'Indonesian',
  4.7,
  980
),
(
  'Cantik Itu Luka',
  'Eka Kurniawan',
  'Novel yang menceritakan kisah Dewi Lestari dan penggalan hidupnya di tengah revolusi sosial Indonesia.',
  'Fiction',
  'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf',
  2002,
  384,
  'Indonesian',
  4.6,
  850
),
(
  'Perahu Kertas',
  'Dee Lestari',
  'Cerita cinta Kugy dan Kara yang bergerak antara cita-cita besar dan kenapa cinta tidak selalu berakhir bahagia.',
  'Romance',
  'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf',
  2009,
  392,
  'Indonesian',
  4.5,
  1100
),
(
  'Negeri 5 Menara',
  'Ahmad Fuadi',
  'Kisah transformasi seorang pemuda dari Minangkabau yang mencari identitas dan mimpinya di pesantren.',
  'Coming of Age',
  'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf',
  2009,
  468,
  'Indonesian',
  4.7,
  1350
),
(
  'Ayah',
  'Andrea Hirata',
  'Dilanjutkan dari Laskar Pelangi, cerita tentang guru Ibnu Hajar dan kehidupan di Belitung.',
  'Fiction',
  'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf',
  2010,
  408,
  'Indonesian',
  4.6,
  920
),
(
  'Rumah Doa',
  'Oka Rusmini',
  'Epik yang bercerita tentang kehidupan keluarga dalam tradisi Hindu Bali dalam kurun waktu tiga generasi.',
  'Historical Fiction',
  'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf',
  2004,
  448,
  'Indonesian',
  4.5,
  650
),
(
  'Layar Terkembang',
  'Sutan Takdir Alisjahbana',
  'Novel klasik yang mengutarakan pembaharuan dan pencerahan dalam budaya Indonesia modern.',
  'Fiction',
  'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf',
  1937,
  256,
  'Indonesian',
  4.4,
  580
),
(
  'Si Anak Pejantan',
  'Pramoedya Ananta Toer',
  'Novelet yang menceritakan tentang seorang anak laki-laki yang berusaha menemukan jati dirinya.',
  'Fiction',
  'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf',
  1958,
  120,
  'Indonesian',
  4.3,
  420
),
(
  'Saman',
  'Ayu Utami',
  'Novel eksperimental yang menceritakan kehidupan empat perempuan dengan gaya naratif yang unik.',
  'Fiction',
  'https://www.w3.org/WAI/WCAG21/Techniques/pdf/sample.pdf',
  1998,
  384,
  'Indonesian',
  4.4,
  710
);

-- Verify data
SELECT COUNT(*) as total_books FROM books;
