# RuangKelas

Aplikasi kelas mini untuk mahasiswa dan dosen. Seluruh aplikasi (frontend, API, database, dan file tugas) berjalan di Netlify, sehingga bisa dibuka dari HP, laptop, atau tablet mana pun lewat alamat:

**https://effulgent-melba-81ec23.netlify.app**

## Arsitektur
- **Frontend**: `index.html`, `css/`, `js/` (disalin ke `dist/` oleh `npm run build:netlify`).
- **API**: Express di `server/app.js`, dijalankan sebagai Netlify Function `netlify/functions/api.js`. Semua permintaan `/api/*` diarahkan ke function ini (lihat `netlify.toml`), jadi frontend dan API berada di domain yang sama.
- **Database**: Netlify Database (Postgres). Skema ada di `db/schema.ts`, migrasi di `netlify/database/migrations/` dan diterapkan otomatis saat deploy.
- **File tugas**: Netlify Blobs (maksimal 4 MB per file).
- **Sesi login & kode reset password**: disimpan di database, sehingga berlaku di semua perangkat.

## Pengaturan wajib di Netlify
1. Buat/aktifkan **Netlify Database** untuk situs ini. Database memakai PostgreSQL; penggunaan compute dan bandwidth dapat mengonsumsi credit, jadi cek usage di dashboard.
2. Di dashboard database, pilih branch production dan salin connection string-nya. Buka **Project configuration → Environment variables** pada situs Netlify, lalu tambahkan:

| Variable | Keterangan |
| --- | --- |
| `NETLIFY_DATABASE_URL` | **Wajib.** Connection string dari branch production Netlify Database. Perlakukan sebagai rahasia. |
| `OWNER_TOKEN` | **Wajib.** Teks rahasia yang panjang dan acak. Dipakai untuk membuat akun dosen pertama dan menyetujui pendaftar. Jangan dibagikan. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Opsional, untuk fitur reset password lewat email dan notifikasi persetujuan. |

3. Setelah menambah atau mengubah variable, jalankan ulang deploy (**Deploys → Trigger deploy**).

## Langkah pertama setelah deploy
1. Buka aplikasi, klik **Admin: Verifikasi Pendaftar** di halaman login, lalu masukkan `OWNER_TOKEN`.
2. Isi form **Tambah Akun Dosen** untuk membuat akun dosen pertama.
3. Mahasiswa mendaftar lewat form pendaftaran. Pendaftar bisa disetujui oleh pemilik (dengan `OWNER_TOKEN`) atau oleh dosen yang sudah login melalui tombol **Verifikasi Pendaftar** di dashboard.

## Menjalankan secara lokal
```bash
npm install
netlify dev
```
`netlify dev` menyediakan Netlify Database dan Blobs secara lokal. Tes utilitas dijalankan dengan `npm test`.

## Struktur relasi
- `mahasiswa`, `dosen`, `matakuliah`, `mahasiswa_dosen`
- Satu mahasiswa bisa memiliki banyak dosen, dan satu dosen bisa membimbing banyak mahasiswa.

## Catatan
Skrip lama di root dan `scripts/` (misalnya `apply_schema.js`, `approve_direct.js`, `test_connect.js`) serta `db/schema.sql` hanya untuk database MySQL lokal versi sebelumnya dan tidak dipakai oleh aplikasi di Netlify.
