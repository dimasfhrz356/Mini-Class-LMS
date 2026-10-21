# RuangKelas MySQL

Proyek ini sudah dibuat dengan struktur relasi antar tabel untuk data mahasiswa dan dosen, lalu dihubungkan ke MySQL.

## Deploy agar bisa diakses dari perangkat lain

Netlify hanya menyajikan frontend statis. Untuk fitur lengkap (login, data bersama, dan API), jalankan backend Express dan MySQL di Railway; Netlify tetap menjadi alamat website publik. Akun GitHub saja belum cukup: buat akun Netlify dan Railway menggunakan GitHub. Tidak perlu mengirim kredensial atau token ke siapa pun.

Struktur repository saat ini menempatkan aplikasi di folder `pppp`. Pilih folder itu sebagai **Base directory/Root Directory** pada kedua layanan.

### 1. Siapkan database dan backend di Railway

1. Buat project Railway dari repository GitHub, pilih root directory `pppp`, lalu tambahkan layanan MySQL.
2. Buat layanan backend Node.js dari repository yang sama dengan root directory `pppp` dan start command `npm start`.
3. Atur environment variables backend:

   ```env
   NODE_ENV=production
   DB_HOST=${{MySQL.MYSQLHOST}}
   DB_PORT=${{MySQL.MYSQLPORT}}
   DB_USER=${{MySQL.MYSQLUSER}}
   DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
   DB_NAME=${{MySQL.MYSQLDATABASE}}
   OWNER_TOKEN=<buat-token-rahasia-panjang-dan-acak>
   CORS_ORIGINS=https://<nama-site-anda>.netlify.app
   UPLOAD_DIR=/data/task-submissions
   ```

   Pilih nama layanan MySQL yang sesuai dengan project jika bukan `MySQL`. Simpan `OWNER_TOKEN` sebagai variable rahasia di dashboard, bukan di repository.
4. Pasang persistent volume Railway pada `/data`. Tanpa volume, file tugas dapat hilang saat layanan dibuat ulang. Gunakan satu instance backend agar sesi login dalam memori tetap konsisten.
5. Buat domain publik untuk layanan backend dan pastikan `https://<domain-backend>/api/health` mengembalikan status `ok`.

### 2. Pindahkan database lokal dengan aman

Jika ingin mempertahankan data MySQL lokal, ekspor database lokal lalu impor ke database Railway sebelum menghubungkan frontend. Contoh dari komputer yang memiliki `mysqldump`/`mysql`:

```powershell
mysqldump -h 127.0.0.1 -P 3306 -u root -p --single-transaction kampus_db > kampus_db-backup.sql
mysql -h <host-publik-mysql-railway> -P <port-publik-mysql-railway> -u <user-mysql> -p <nama-database-railway> < kampus_db-backup.sql
```

Gunakan detail koneksi publik database yang diberikan Railway; aplikasi backend sendiri harus memakai variabel koneksi internal di atas. Simpan backup di luar repository, jangan unggah ke GitHub, dan tinjau `db/schema.sql` sebelum menjalankannya pada database berisi data karena skrip meng-upsert tiga mata kuliah demo. Skrip ini tidak menambahkan akun mahasiswa atau dosen demo.

### 3. Deploy frontend ke Netlify

1. Impor repository GitHub yang sama di Netlify dan tetapkan base directory `pppp`. Konfigurasi [netlify.toml](./netlify.toml) akan memakai perintah build yang telah disediakan.
2. Tambahkan environment variable Netlify `API_BASE_URL` dengan nilai `https://<domain-backend-railway>/api`.
3. Deploy. Build mempublikasikan hanya frontend di `dist/`; file database, `.env`, dan kode backend tidak dipublikasikan.
4. Setelah URL website Netlify diketahui, isi `CORS_ORIGINS` di layanan backend dengan origin persis website tersebut, tanpa slash di akhir, lalu deploy ulang backend. Pastikan `API_BASE_URL` dan domain backend memakai HTTPS.
5. Buka alamat Netlify dari perangkat lain dan uji login serta pemuatan data.

Build Netlify gagal dengan pesan yang menjelaskan masalah bila `API_BASE_URL` belum diatur atau formatnya salah. File `.env` lokal tidak digunakan oleh Netlify/Railway; atur variable masing-masing melalui dashboard layanan.

## Struktur relasi
- mahasiswa
- dosen
- matakuliah
- mahasiswa_dosen

Hubungan yang dibuat adalah:
- satu mahasiswa bisa memiliki banyak dosen
- satu dosen bisa membimbing banyak mahasiswa
- satu mahasiswa bisa mengambil banyak mata kuliah
- satu dosen bisa mengampu beberapa mata kuliah

## File penting
- `db/schema.sql` : skrip pembuatan database dan tabel
- `server.js` : server Node.js yang terhubung ke MySQL
- `.env.example` : contoh konfigurasi database
- `package.json` : dependency project

## Persiapan MySQL
1. Pastikan MySQL sudah aktif di komputer Anda.
2. Buat database atau jalankan file SQL:
   ```bash
   mysql -u root -p < db/schema.sql
   ```
3. Salin file `.env.example` menjadi `.env` dan sesuaikan konfigurasi:
   ```bash
   copy .env.example .env
   ```
4. Ubah nilai sesuai server MySQL Anda:
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=kampus_db
   PORT=3000
   OWNER_TOKEN=buat-token-rahasia-yang-panjang-dan-acak
   ```

## Menjalankan server
```bash
npm install
npm start
```

Setelah server berjalan, cek endpoint:
- http://localhost:3000/api/health
- http://localhost:3000/api/mahasiswa
- http://localhost:3000/api/dosen

Untuk persetujuan pendaftar, isi `OWNER_TOKEN` pada `.env` dengan nilai rahasia yang panjang dan jangan bagikan atau unggah file `.env`. File pengumpulan tugas dibatasi maksimal 5 MB, menerima PDF, dokumen Office, gambar PNG/JPEG, TXT, Markdown, CSV, dan ZIP, lalu disimpan di folder `uploads/task-submissions`.

Reset password membutuhkan konfigurasi SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, dan opsional `SMTP_FROM`). Kode verifikasi tidak ditampilkan di aplikasi atau dikirim dalam respons API.

Endpoint data dan pengelolaan membutuhkan sesi login. Sesi berlaku selama 12 jam; keluar dari aplikasi akan mencabut sesi. Operasi pengelolaan hanya tersedia untuk dosen, sedangkan mahasiswa hanya dapat mengirim tugas ke akunnya sendiri.

Jalankan tes utilitas dengan:
```bash
npm test
```

## Endpoint utama
- GET /api/mahasiswa
- GET /api/dosen
- GET /api/mahasiswa/:id/dosen
- GET /api/dosen/:id/mahasiswa
- POST /api/mahasiswa
- POST /api/dosen
- POST /api/mahasiswa/:id/dosen

## Contoh relasi
Contoh data yang sudah dibuat:
- Rina Amelia dibimbing oleh Dr. Siti Rahma dan Budi Santoso
- Dedi Pratama dibimbing oleh Dr. Siti Rahma

Ini menunjukkan koneksi data mahasiswa dan dosen yang tersimpan di MySQL.
