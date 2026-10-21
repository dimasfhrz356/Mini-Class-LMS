CREATE DATABASE IF NOT EXISTS kampus_db;
USE kampus_db;

CREATE TABLE IF NOT EXISTS mahasiswa (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  nim VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  approved TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dosen (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  nip VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS matakuliah (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  kode VARCHAR(20) NOT NULL UNIQUE,
  sks INT NOT NULL DEFAULT 3,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mahasiswa_dosen (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mahasiswa_id INT NOT NULL,
  dosen_id INT NOT NULL,
  matakuliah_id INT NOT NULL,
  UNIQUE (mahasiswa_id, dosen_id, matakuliah_id),
  FOREIGN KEY (mahasiswa_id) REFERENCES mahasiswa(id) ON DELETE CASCADE,
  FOREIGN KEY (dosen_id) REFERENCES dosen(id) ON DELETE CASCADE,
  FOREIGN KEY (matakuliah_id) REFERENCES matakuliah(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS materi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matakuliah_id INT NULL,
  judul VARCHAR(200) NOT NULL,
  tipe VARCHAR(50) DEFAULT 'PDF',
  deskripsi TEXT,
  tanggal DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (matakuliah_id) REFERENCES matakuliah(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tugas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  matakuliah_id INT NULL,
  judul VARCHAR(200) NOT NULL,
  deadline DATE,
  deskripsi TEXT,
  status VARCHAR(50) DEFAULT 'Belum dikumpulkan',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (matakuliah_id) REFERENCES matakuliah(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tugas_pengumpulan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tugas_id INT NOT NULL,
  mahasiswa_id INT NULL,
  mahasiswa_nama VARCHAR(150) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NULL,
  catatan TEXT,
  tanggal DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (tugas_id, mahasiswa_id),
  FOREIGN KEY (tugas_id) REFERENCES tugas(id) ON DELETE CASCADE,
  FOREIGN KEY (mahasiswa_id) REFERENCES mahasiswa(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS nilai (
  id INT AUTO_INCREMENT PRIMARY KEY,
  mahasiswa_nama VARCHAR(150) NOT NULL,
  tugas_id INT NULL,
  matakuliah_id INT NULL,
  nilai INT NOT NULL,
  feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tugas_id) REFERENCES tugas(id) ON DELETE SET NULL,
  FOREIGN KEY (matakuliah_id) REFERENCES matakuliah(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pengumuman (
  id INT AUTO_INCREMENT PRIMARY KEY,
  judul VARCHAR(200) NOT NULL,
  isi TEXT NOT NULL,
  tanggal DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO matakuliah (nama, kode, sks) VALUES
('Basis Data', 'DB101', 3),
('Pemrograman Web', 'WEB201', 3),
('Sistem Informasi', 'SI301', 3)
ON DUPLICATE KEY UPDATE nama = VALUES(nama), sks = VALUES(sks);

SELECT 'Database kampus_db berhasil dibuat.' AS status;
