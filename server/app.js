const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { getDatabase } = require('@netlify/database');
const { getStore } = require('@netlify/blobs');
const { generateVerificationCode, sendResetCodeEmail } = require('../utils/passwordReset');

const app = express();
// Frontend dan API berada di domain Netlify yang sama, jadi CORS hanya diperlukan untuk origin tambahan.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.set('trust proxy', true);
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
}));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet({ contentSecurityPolicy: false }));

// Batas payload Netlify Functions adalah 6 MB, sedangkan file dikirim dalam base64 (+33%).
const maxSubmissionSize = 4 * 1024 * 1024;
const allowedSubmissionExtensions = new Set([
  '.csv', '.doc', '.docx', '.jpeg', '.jpg', '.md', '.pdf', '.png', '.ppt', '.pptx', '.txt', '.xls', '.xlsx', '.zip',
]);

function getSubmissionStore() {
  return getStore({ name: 'task-submissions', consistency: 'strong' });
}

// Pembungkus kecil di atas Netlify Database (Postgres) dengan placeholder `?`.
// SELECT mengembalikan [rows]; perintah lain mengembalikan [{ affectedRows, insertId }].
let database;
async function getDb() {
  if (!database) database = getDatabase();
  return {
    async execute(text, params = []) {
      let index = 0;
      const sql = text.replace(/\?/g, () => `$${++index}`);
      const result = await database.pool.query(sql, params);
      if (result.command === 'SELECT') return [result.rows];
      return [{ affectedRows: result.rowCount, insertId: result.rows?.[0]?.id, rows: result.rows }];
    },
  };
}

const publicApiPaths = new Set([
  '/register',
  '/login',
  '/login-dosen',
  '/forgot-password/request',
  '/forgot-password/verify',
  '/forgot-password',
]);
const authSessionLifetime = 12 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isOwnerRequest(req) {
  const token = String(req.query.token || req.headers['x-owner-token'] || '');
  return !!process.env.OWNER_TOKEN && token === process.env.OWNER_TOKEN;
}

async function createAuthSession({ id, role, identifier }) {
  const token = crypto.randomBytes(32).toString('hex');
  const db = await getDb();
  await db.execute('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
  await db.execute(
    'INSERT INTO auth_sessions (token_hash, user_id, role, identifier, expires_at) VALUES (?, ?, ?, ?, ?)',
    [hashToken(token), id, role, String(identifier), new Date(Date.now() + authSessionLifetime)]
  );
  return token;
}

async function getAuthSession(token) {
  if (!token) return null;
  const db = await getDb();
  const [rows] = await db.execute(
    'SELECT user_id, role, identifier, expires_at FROM auth_sessions WHERE token_hash = ?',
    [hashToken(token)]
  );
  if (!rows.length) return null;
  const row = rows[0];
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.execute('DELETE FROM auth_sessions WHERE token_hash = ?', [hashToken(token)]);
    return null;
  }
  return { id: row.user_id, role: row.role, identifier: row.identifier };
}

app.use('/api', async (req, res, next) => {
  // Pemilik (OWNER_TOKEN) boleh tanpa login; selain itu verifikasi pendaftar memerlukan sesi dosen.
  const ownerPath = isOwnerRequest(req) && (req.path === '/pending-registrations'
    || /^\/approve\/\d+$/.test(req.path)
    || (req.path === '/dosen' && req.method === 'POST'));
  if ((req.path === '/health' && (req.method === 'GET' || req.method === 'HEAD'))
    || publicApiPaths.has(req.path)
    || ownerPath) {
    return next();
  }

  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token && (req.query.token || req.headers['x-owner-token'])) {
    if (!process.env.OWNER_TOKEN) {
      return res.status(503).json({ message: 'OWNER_TOKEN belum diatur di environment variable Netlify. Atur terlebih dahulu lalu deploy ulang.' });
    }
    return res.status(403).json({ message: 'Token owner tidak valid' });
  }
  let session;
  try {
    session = await getAuthSession(token);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
  if (!session) {
    return res.status(401).json({ message: 'Sesi login tidak valid atau sudah berakhir. Silakan login kembali.' });
  }

  req.auth = session;
  req.authToken = token;
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    if (session.role === 'mahasiswa'
      && (req.path === '/mahasiswa' || req.path === '/pending-registrations'
        || /^\/dosen\/\d+\/mahasiswa$/.test(req.path))) {
      return res.status(403).json({ message: 'Data ini hanya dapat diakses oleh dosen' });
    }
    const studentRelation = req.path.match(/^\/mahasiswa\/(\d+)\/dosen$/);
    if (session.role === 'mahasiswa' && studentRelation && Number(studentRelation[1]) !== Number(session.id)) {
      return res.status(403).json({ message: 'Anda hanya dapat melihat relasi dosen milik sendiri' });
    }
    return next();
  }

  if (req.path === '/logout') return next();
  if (req.path === '/change-password') {
    const field = session.role === 'dosen' ? 'nip' : 'nim';
    const identifier = String(req.body?.[field] || '').trim();
    if (req.body?.role !== session.role || identifier !== session.identifier) {
      return res.status(403).json({ message: 'Anda hanya dapat mengubah password akun sendiri' });
    }
    return next();
  }

  if (/^\/tugas\/\d+\/kumpulkan$/.test(req.path)) {
    if (session.role !== 'mahasiswa') {
      return res.status(403).json({ message: 'Pengumpulan tugas hanya tersedia untuk akun mahasiswa' });
    }
    return next();
  }

  if (session.role !== 'dosen') {
    return res.status(403).json({ message: 'Akses ini hanya tersedia untuk dosen' });
  }
  return next();
});

async function passwordMatches(inputPassword, storedPassword) {
  if (!storedPassword) return false;

  if (storedPassword === inputPassword) {
    return true;
  }

  try {
    return await bcrypt.compare(inputPassword, storedPassword);
  } catch (error) {
    return false;
  }
}

// create nodemailer transporter if env provided
let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

function getResetSessionKey(role, identifier, email) {
  return `${String(role || 'mahasiswa').toLowerCase()}:${String(identifier || '').trim().toLowerCase()}:${String(email || '').trim().toLowerCase()}`;
}

async function getResetSession(sessionKey) {
  const db = await getDb();
  const [rows] = await db.execute(
    'SELECT code, name, verified, expires_at FROM password_resets WHERE session_key = ?',
    [sessionKey]
  );
  if (!rows.length) return null;
  return { ...rows[0], expiresAt: new Date(rows[0].expires_at).getTime() };
}

async function deleteResetSession(sessionKey) {
  const db = await getDb();
  await db.execute('DELETE FROM password_resets WHERE session_key = ?', [sessionKey]);
}

app.get('/api/health', async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute('SELECT 1 AS ok');
    res.json({
      status: 'ok',
      message: 'Koneksi database berhasil',
      result: rows[0],
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Koneksi database gagal',
      details: error.message,
    });
  }
});

app.post('/api/logout', async (req, res) => {
  try {
    const db = await getDb();
    await db.execute('DELETE FROM auth_sessions WHERE token_hash = ?', [hashToken(req.authToken)]);
    res.json({ message: 'Logout berhasil' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/mahasiswa', async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute(`
      SELECT m.id, m.nama, m.nim, m.email,
             STRING_AGG(DISTINCT d.nama || ' (' || mk.nama || ')', '; ') AS dosen_list
      FROM mahasiswa m
      LEFT JOIN mahasiswa_dosen md ON md.mahasiswa_id = m.id
      LEFT JOIN dosen d ON d.id = md.dosen_id
      LEFT JOIN matakuliah mk ON mk.id = md.matakuliah_id
      GROUP BY m.id, m.nama, m.nim, m.email
      ORDER BY m.id ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/dosen', async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute(`
      SELECT d.id, d.nama, d.nip, d.email,
             STRING_AGG(DISTINCT m.nama || ' (' || mk.nama || ')', '; ') AS mahasiswa_list
      FROM dosen d
      LEFT JOIN mahasiswa_dosen md ON md.dosen_id = d.id
      LEFT JOIN mahasiswa m ON m.id = md.mahasiswa_id
      LEFT JOIN matakuliah mk ON mk.id = md.matakuliah_id
      GROUP BY d.id, d.nama, d.nip, d.email
      ORDER BY d.id ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/mahasiswa/:id/dosen', async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute(`
      SELECT md.id, d.id AS dosen_id, d.nama AS dosen_nama, d.nip, mk.id AS matakuliah_id, mk.nama AS matakuliah_nama
      FROM mahasiswa_dosen md
      INNER JOIN dosen d ON d.id = md.dosen_id
      INNER JOIN matakuliah mk ON mk.id = md.matakuliah_id
      WHERE md.mahasiswa_id = ?
      ORDER BY md.id ASC
    `, [req.params.id]);

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/dosen/:id/mahasiswa', async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute(`
      SELECT md.id, m.id AS mahasiswa_id, m.nama AS mahasiswa_nama, m.nim, mk.id AS matakuliah_id, mk.nama AS matakuliah_nama
      FROM mahasiswa_dosen md
      INNER JOIN mahasiswa m ON m.id = md.mahasiswa_id
      INNER JOIN matakuliah mk ON mk.id = md.matakuliah_id
      WHERE md.dosen_id = ?
      ORDER BY md.id ASC
    `, [req.params.id]);

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/mahasiswa', async (req, res) => {
  try {
    const { nama, nim, email, password } = req.body;

    if (!nama || !nim || !email || !password) {
      return res.status(400).json({ message: 'Semua field wajib diisi' });
    }

    const db = await getDb();
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO mahasiswa (nama, nim, email, password, approved) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [nama, nim, email, hashed, 1]
    );

    res.status(201).json({
      id: result.insertId,
      nama,
      nim,
      email,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Dosen dapat ditambahkan oleh dosen yang sudah login atau oleh pemilik melalui OWNER_TOKEN.
app.post('/api/dosen', async (req, res) => {
  try {
    const { nama, nip, email, password } = req.body;

    if (!nama || !nip || !email || !password) {
      return res.status(400).json({ message: 'Semua field wajib diisi' });
    }

    const db = await getDb();
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO dosen (nama, nip, email, password) VALUES (?, ?, ?, ?) RETURNING id',
      [nama, nip, email, hashed]
    );

    res.status(201).json({
      id: result.insertId,
      nama,
      nip,
      email,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// New: registration endpoint that creates mahasiswa with approved=0 (pending)
app.post('/api/register', async (req, res) => {
  try {
    const { nama, nim, email, password, ownerToken } = req.body;
    if (!nama || !nim || !email || !password) return res.status(400).json({ message: 'Semua field wajib diisi' });

    const db = await getDb();
    const hashed = await bcrypt.hash(password, 10);

    // determine approval: if ownerToken provided (body) or query/header token matches OWNER_TOKEN, auto-approve
    let approved = 0;
    const providedToken = (ownerToken || req.query.token || req.headers['x-owner-token'] || '').toString();
    if (providedToken && process.env.OWNER_TOKEN && providedToken === process.env.OWNER_TOKEN) {
      approved = 1;
    }

    const [result] = await db.execute(
      'INSERT INTO mahasiswa (nama, nim, email, password, approved) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [nama, nim, email, hashed, approved]
    );

    res.status(201).json({ id: result.insertId, nama, nim, email, status: approved ? 'active' : 'pending' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// New: login for mahasiswa (only allows approved accounts)
// Rate limit login attempts to mitigate brute-force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak percobaan login, coba lagi nanti.' }
});

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Terlalu banyak percobaan reset password, coba lagi nanti.' },
});

app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const identifier = String(req.body.identifier ?? req.body.nim ?? req.body.nip ?? '').trim();
    const password = req.body.password;

    if (!identifier || !password) return res.status(400).json({ message: 'NIM/NIP dan password wajib diisi' });

    const db = await getDb();

    const [mahasiswaRows] = await db.execute('SELECT id, nama, nim, email, approved, password FROM mahasiswa WHERE nim = ?', [identifier]);
    if (mahasiswaRows && mahasiswaRows.length > 0) {
      const u = mahasiswaRows[0];
      const legacyMatch = u.password === password;
      const ok = await passwordMatches(password, u.password);

      if (!ok && !legacyMatch) {
        return res.status(401).json({ message: 'NIM atau password salah' });
      }

      if (legacyMatch) {
        const rehashed = await bcrypt.hash(password, 10);
        await db.execute('UPDATE mahasiswa SET password = ? WHERE id = ?', [rehashed, u.id]);
      }

      if (Number(u.approved) === 0) return res.status(403).json({ message: 'Akun Anda masih menunggu verifikasi oleh dosen/pemilik' });

      return res.json({
        id: u.id,
        nama: u.nama,
        nim: u.nim,
        email: u.email,
        role: 'mahasiswa',
        token: await createAuthSession({ id: u.id, role: 'mahasiswa', identifier: u.nim }),
      });
    }

    const [dosenRows] = await db.execute('SELECT id, nama, nip, email, password FROM dosen WHERE nip = ?', [identifier]);
    if (!dosenRows || dosenRows.length === 0) return res.status(401).json({ message: 'NIM/NIP atau password salah' });

    const d = dosenRows[0];
    const legacyMatch = d.password === password;
    const ok = await passwordMatches(password, d.password);

    if (!ok && !legacyMatch) {
      return res.status(401).json({ message: 'NIP atau password salah' });
    }

    if (legacyMatch) {
      const rehashed = await bcrypt.hash(password, 10);
      await db.execute('UPDATE dosen SET password = ? WHERE id = ?', [rehashed, d.id]);
    }

    return res.json({
      id: d.id,
      nama: d.nama,
      nip: d.nip,
      email: d.email,
      role: 'dosen',
      token: await createAuthSession({ id: d.id, role: 'dosen', identifier: d.nip }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/login-dosen', loginLimiter, async (req, res) => {
  try {
    const { nip, password } = req.body;
    if (!nip || !password) return res.status(400).json({ message: 'NIP dan password wajib diisi' });

    const db = await getDb();
    const [rows] = await db.execute('SELECT id, nama, nip, email, password FROM dosen WHERE nip = ?', [nip]);
    if (!rows || rows.length === 0) return res.status(401).json({ message: 'NIP atau password salah' });

    const u = rows[0];
    const legacyMatch = u.password === password;
    const ok = await passwordMatches(password, u.password);

    if (!ok && !legacyMatch) {
      return res.status(401).json({ message: 'NIP atau password salah' });
    }

    if (legacyMatch) {
      const rehashed = await bcrypt.hash(password, 10);
      await db.execute('UPDATE dosen SET password = ? WHERE id = ?', [rehashed, u.id]);
    }

    res.json({
      id: u.id,
      nama: u.nama,
      nip: u.nip,
      email: u.email,
      role: 'dosen',
      token: await createAuthSession({ id: u.id, role: 'dosen', identifier: u.nip }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/forgot-password/request', passwordResetLimiter, async (req, res) => {
  try {
    const { nim, nip, email, role } = req.body;
    const targetRole = (role || 'mahasiswa').toLowerCase();
    const identifier = targetRole === 'dosen' ? (nip || '').trim() : (nim || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!identifier || !normalizedEmail) {
      return res.status(400).json({ message: targetRole === 'dosen' ? 'NIP dan email wajib diisi' : 'NIM dan email wajib diisi' });
    }
    if (!mailer) {
      return res.status(503).json({ message: 'Layanan email belum dikonfigurasi. Hubungi administrator.' });
    }

    const db = await getDb();
    const table = targetRole === 'dosen' ? 'dosen' : 'mahasiswa';
    const idColumn = targetRole === 'dosen' ? 'nip' : 'nim';
    const [rows] = await db.execute(
      `SELECT id, ${idColumn}, email, nama FROM ${table} WHERE ${idColumn} = ? AND email = ?`,
      [identifier, normalizedEmail]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: targetRole === 'dosen' ? 'Data NIP dan email tidak cocok' : 'Data NIM dan email tidak cocok' });
    }

    const user = rows[0];
    const code = generateVerificationCode(6);
    const sessionKey = getResetSessionKey(targetRole, identifier, normalizedEmail);
    await db.execute(
      `INSERT INTO password_resets (session_key, code, name, verified, expires_at) VALUES (?, ?, ?, FALSE, ?)
       ON CONFLICT (session_key) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, verified = FALSE, expires_at = EXCLUDED.expires_at`,
      [sessionKey, code, user.nama || 'Pengguna', new Date(Date.now() + (5 * 60 * 1000))]
    );

    try {
      await sendResetCodeEmail(mailer, {
        to: user.email,
        name: user.nama || 'Pengguna',
        code,
        expiresInMinutes: 5,
      });
    } catch (mailError) {
      await deleteResetSession(sessionKey);
      console.warn('Gagal mengirim kode verifikasi reset password:', mailError.message);
      return res.status(502).json({ message: 'Email verifikasi gagal dikirim. Coba lagi nanti.' });
    }

    return res.json({ message: 'Kode verifikasi berhasil dikirim ke email Anda.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/forgot-password/verify', passwordResetLimiter, async (req, res) => {
  try {
    const { nim, nip, email, role, code } = req.body;
    const targetRole = (role || 'mahasiswa').toLowerCase();
    const identifier = targetRole === 'dosen' ? (nip || '').trim() : (nim || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!identifier || !normalizedEmail || !code) {
      return res.status(400).json({ message: 'NIM/NIP, email, dan kode verifikasi wajib diisi' });
    }

    const sessionKey = getResetSessionKey(targetRole, identifier, normalizedEmail);
    const session = await getResetSession(sessionKey);

    if (!session) {
      return res.status(400).json({ message: 'Kode verifikasi belum dikirim atau sudah kadaluarsa' });
    }

    if (Date.now() > session.expiresAt) {
      await deleteResetSession(sessionKey);
      return res.status(410).json({ message: 'Kode verifikasi sudah kadaluarsa, silakan kirim ulang kode' });
    }

    if (String(session.code) !== String(code).trim()) {
      return res.status(401).json({ message: 'Kode verifikasi tidak valid' });
    }

    await (await getDb()).execute('UPDATE password_resets SET verified = TRUE WHERE session_key = ?', [sessionKey]);
    return res.json({ message: 'Kode verifikasi valid, silakan masukkan password baru.', verified: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { nim, nip, email, newPassword, role } = req.body;
    const targetRole = (role || 'mahasiswa').toLowerCase();
    const identifier = targetRole === 'dosen' ? (nip || '').trim() : (nim || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!identifier || !normalizedEmail || !newPassword) {
      return res.status(400).json({ message: targetRole === 'dosen' ? 'NIP, email, dan password baru wajib diisi' : 'NIM, email, dan password baru wajib diisi' });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ message: 'Password baru minimal 8 karakter' });
    }

    const sessionKey = getResetSessionKey(targetRole, identifier, normalizedEmail);
    const session = await getResetSession(sessionKey);

    if (!session) {
      return res.status(400).json({ message: 'Kode verifikasi belum dikirim atau sudah kadaluarsa' });
    }

    if (Date.now() > session.expiresAt) {
      await deleteResetSession(sessionKey);
      return res.status(410).json({ message: 'Kode verifikasi sudah kadaluarsa, silakan kirim ulang kode' });
    }

    if (!session.verified) {
      return res.status(401).json({ message: 'Silakan verifikasi kode terlebih dahulu di email Anda' });
    }

    const db = await getDb();
    const table = targetRole === 'dosen' ? 'dosen' : 'mahasiswa';
    const idColumn = targetRole === 'dosen' ? 'nip' : 'nim';
    const [rows] = await db.execute(
      `SELECT id, ${idColumn}, email FROM ${table} WHERE ${idColumn} = ? AND email = ?`,
      [identifier, normalizedEmail]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: targetRole === 'dosen' ? 'Data NIP dan email tidak cocok' : 'Data NIM dan email tidak cocok' });
    }

    const hashed = await bcrypt.hash(String(newPassword), 10);
    await db.execute(`UPDATE ${table} SET password = ? WHERE id = ?`, [hashed, rows[0].id]);
    await deleteResetSession(sessionKey);

    res.json({ message: 'Password berhasil direset. Silakan login kembali.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/change-password', async (req, res) => {
  try {
    const { nim, nip, currentPassword, newPassword, role } = req.body;
    const targetRole = (role || 'mahasiswa').toLowerCase();
    const identifier = targetRole === 'dosen' ? (nip || '').trim() : (nim || '').trim();

    if (!identifier || !currentPassword || !newPassword) {
      return res.status(400).json({ message: targetRole === 'dosen' ? 'NIP, password lama, dan password baru wajib diisi' : 'NIM, password lama, dan password baru wajib diisi' });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ message: 'Password baru minimal 8 karakter' });
    }

    const db = await getDb();
    const table = targetRole === 'dosen' ? 'dosen' : 'mahasiswa';
    const idColumn = targetRole === 'dosen' ? 'nip' : 'nim';
    const [rows] = await db.execute(`SELECT id, ${idColumn}, password FROM ${table} WHERE ${idColumn} = ?`, [identifier]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    const u = rows[0];
    const ok = await passwordMatches(String(currentPassword), u.password);
    if (!ok) {
      return res.status(401).json({ message: 'Password lama tidak sesuai' });
    }

    const hashed = await bcrypt.hash(String(newPassword), 10);
    await db.execute(`UPDATE ${table} SET password = ? WHERE id = ?`, [hashed, u.id]);

    res.json({ message: 'Password berhasil diubah' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Daftar pendaftar pending (pemilik via OWNER_TOKEN atau dosen yang login; dicek di middleware)
app.get('/api/pending-registrations', async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute('SELECT id, nama, nim, email, created_at FROM mahasiswa WHERE approved = 0 ORDER BY created_at ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Setujui mahasiswa (pemilik atau dosen yang login)
app.post('/api/approve/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID tidak valid' });

    const db = await getDb();
    await db.execute('UPDATE mahasiswa SET approved = 1 WHERE id = ?', [id]);
    // send notification email if mailer configured
    try {
      const [rows] = await db.execute('SELECT email, nama FROM mahasiswa WHERE id = ?', [id]);
      if (rows && rows[0] && mailer) {
        const m = rows[0];
        await mailer.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: m.email,
          subject: 'Akun RuangKelas Disetujui',
          text: `Halo ${m.nama},\n\nAkun RuangKelas Anda telah disetujui. Anda kini dapat masuk menggunakan NIM dan password yang Anda daftarkan.\n\nSalam,\nTim RuangKelas`,
        });
      }
    } catch (mailErr) {
      console.warn('Gagal mengirim email notifikasi:', mailErr.message);
    }

    res.json({ message: 'Mahasiswa berhasil disetujui', id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/mahasiswa/:id/dosen', async (req, res) => {
  try {
    const { dosen_id, matakuliah_id } = req.body;
    const mahasiswa_id = Number(req.params.id);

    if (!dosen_id || !matakuliah_id) {
      return res.status(400).json({ message: 'dosen_id dan matakuliah_id wajib diisi' });
    }

    const db = await getDb();
    const [result] = await db.execute(
      `INSERT INTO mahasiswa_dosen (mahasiswa_id, dosen_id, matakuliah_id)
       VALUES (?, ?, ?)
       ON CONFLICT (mahasiswa_id, dosen_id, matakuliah_id) DO NOTHING`,
      [mahasiswa_id, dosen_id, matakuliah_id]
    );

    res.status(201).json({
      message: 'Relasi mahasiswa dan dosen berhasil dibuat',
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/matakuliah', async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute('SELECT * FROM matakuliah ORDER BY id ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/matakuliah', async (req, res) => {
  try {
    const { nama, kode, sks } = req.body;
    if (!nama || !kode) {
      return res.status(400).json({ message: 'Nama dan kode matakuliah wajib diisi' });
    }
    const db = await getDb();
    const [result] = await db.execute(
      'INSERT INTO matakuliah (nama, kode, sks) VALUES (?, ?, ?) RETURNING id',
      [nama, kode, Number(sks) || 3]
    );
    res.status(201).json({ id: result.insertId, nama, kode, sks: Number(sks) || 3 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/matakuliah/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nama, kode, sks } = req.body;
    if (!id || !nama || !kode) {
      return res.status(400).json({ message: 'ID, nama, dan kode matakuliah wajib diisi' });
    }
    const db = await getDb();
    const [result] = await db.execute(
      'UPDATE matakuliah SET nama = ?, kode = ?, sks = ? WHERE id = ?',
      [nama, kode, Number(sks) || 3, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Mata kuliah tidak ditemukan' });
    res.json({ id, nama, kode, sks: Number(sks) || 3, message: 'Mata kuliah berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/matakuliah/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID tidak valid' });
    const db = await getDb();
    const [result] = await db.execute('DELETE FROM matakuliah WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Mata kuliah tidak ditemukan' });
    res.json({ message: 'Mata kuliah berhasil dihapus', id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/matakuliah/bulk', async (req, res) => {
  try {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : Array.isArray(req.body) ? req.body : [];
    if (!rawItems.length) {
      return res.status(400).json({ message: 'Data mata kuliah wajib diisi' });
    }

    const items = rawItems
      .map((item) => {
        const nama = String(item?.nama ?? item?.name ?? '').trim();
        const kode = String(item?.kode ?? item?.code ?? '').trim();
        const sks = Number(item?.sks ?? item?.credits ?? 3);
        return [nama, kode, Number.isFinite(sks) && sks > 0 ? sks : 3];
      })
      .filter(([nama, kode]) => nama && kode);

    if (!items.length) {
      return res.status(400).json({ message: 'Setiap mata kuliah harus punya nama dan kode' });
    }

    const db = await getDb();
    const placeholders = items.map(() => '(?, ?, ?)').join(', ');
    const [result] = await db.execute(`INSERT INTO matakuliah (nama, kode, sks) VALUES ${placeholders}`, items.flat());

    res.status(201).json({
      inserted: result.affectedRows,
      message: 'Mata kuliah berhasil ditambahkan ke database',
      items: items.map(([nama, kode, sks]) => ({ nama, kode, sks })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/materi', async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute(`
      SELECT m.*, mk.nama AS matakuliah_nama
      FROM materi m
      LEFT JOIN matakuliah mk ON mk.id = m.matakuliah_id
      ORDER BY m.id ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/materi', async (req, res) => {
  try {
    const { matakuliah_id, judul, tipe, deskripsi, tanggal } = req.body;
    if (!judul) {
      return res.status(400).json({ message: 'Judul materi wajib diisi' });
    }
    const db = await getDb();
    const [result] = await db.execute(
      'INSERT INTO materi (matakuliah_id, judul, tipe, deskripsi, tanggal) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [matakuliah_id || null, judul, tipe || 'PDF', deskripsi || '', tanggal || new Date().toISOString().slice(0, 10)]
    );
    res.status(201).json({ id: result.insertId, judul, tipe: tipe || 'PDF' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/materi/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { matakuliah_id, judul, tipe, deskripsi, tanggal } = req.body;
    if (!id || !judul) return res.status(400).json({ message: 'ID dan judul materi wajib diisi' });
    const db = await getDb();
    const [result] = await db.execute(
      'UPDATE materi SET matakuliah_id = ?, judul = ?, tipe = ?, deskripsi = ?, tanggal = ? WHERE id = ?',
      [matakuliah_id || null, judul, tipe || 'PDF', deskripsi || '', tanggal || new Date().toISOString().slice(0, 10), id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Materi tidak ditemukan' });
    res.json({ id, judul, tipe: tipe || 'PDF', message: 'Materi berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/materi/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID tidak valid' });
    const db = await getDb();
    const [result] = await db.execute('DELETE FROM materi WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Materi tidak ditemukan' });
    res.json({ message: 'Materi berhasil dihapus', id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/tugas', async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute(`
      SELECT t.*, mk.nama AS matakuliah_nama
      FROM tugas t
      LEFT JOIN matakuliah mk ON mk.id = t.matakuliah_id
      ORDER BY t.id ASC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/tugas', async (req, res) => {
  try {
    const { matakuliah_id, judul, deadline, deskripsi, status } = req.body;
    if (!judul) {
      return res.status(400).json({ message: 'Judul tugas wajib diisi' });
    }
    const db = await getDb();
    const [result] = await db.execute(
      'INSERT INTO tugas (matakuliah_id, judul, deadline, deskripsi, status) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [matakuliah_id || null, judul, deadline || null, deskripsi || '', status || 'Belum dikumpulkan']
    );
    res.status(201).json({ id: result.insertId, judul, status: status || 'Belum dikumpulkan' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/tugas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { matakuliah_id, judul, deadline, deskripsi, status } = req.body;
    if (!id || !judul) return res.status(400).json({ message: 'ID dan judul tugas wajib diisi' });
    const db = await getDb();
    const [result] = await db.execute(
      'UPDATE tugas SET matakuliah_id = ?, judul = ?, deadline = ?, deskripsi = ?, status = ? WHERE id = ?',
      [matakuliah_id || null, judul, deadline || null, deskripsi || '', status || 'Belum dikumpulkan', id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Tugas tidak ditemukan' });
    res.json({ id, judul, status: status || 'Belum dikumpulkan', message: 'Tugas berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/tugas/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID tidak valid' });
    const db = await getDb();
    const [result] = await db.execute('DELETE FROM tugas WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Tugas tidak ditemukan' });
    res.json({ message: 'Tugas berhasil dihapus', id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/tugas/:id/kumpulkan', async (req, res) => {
  try {
    const tugasId = Number(req.params.id);
    const { file_name, file_content, catatan, tanggal } = req.body;
    const originalFileName = path.basename(String(file_name || '')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    const extension = path.extname(originalFileName).toLowerCase();

    if (!tugasId || !originalFileName || typeof file_content !== 'string') {
      return res.status(400).json({ message: 'ID tugas dan file wajib diisi' });
    }
    if (!allowedSubmissionExtensions.has(extension)) {
      return res.status(400).json({ message: 'Format file tidak didukung' });
    }
    if (!file_content || file_content.length > Math.ceil(maxSubmissionSize / 3) * 4
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file_content)) {
      return res.status(400).json({ message: 'Isi file tidak valid atau ukuran file melebihi 4 MB' });
    }

    const fileBuffer = Buffer.from(file_content, 'base64');
    if (fileBuffer.length === 0 || fileBuffer.length > maxSubmissionSize || fileBuffer.toString('base64') !== file_content) {
      return res.status(400).json({ message: 'Isi file tidak valid atau ukuran file melebihi 4 MB' });
    }

    const db = await getDb();
    const [tugasRows] = await db.execute('SELECT id FROM tugas WHERE id = ?', [tugasId]);
    if (!tugasRows || tugasRows.length === 0) {
      return res.status(404).json({ message: 'Tugas tidak ditemukan' });
    }

    const studentId = req.auth.id;
    const [studentRows] = await db.execute('SELECT nama FROM mahasiswa WHERE id = ?', [studentId]);
    if (!studentRows.length) return res.status(404).json({ message: 'Akun mahasiswa tidak ditemukan' });
    const finalNama = studentRows[0].nama;
    const [existingRows] = await db.execute(
      'SELECT id, file_path FROM tugas_pengumpulan WHERE tugas_id = ? AND mahasiswa_id IS NOT DISTINCT FROM ?',
      [tugasId, studentId]
    );
    const storedFileName = `${crypto.randomUUID()}${extension}`;
    const relativeFilePath = storedFileName;
    const store = getSubmissionStore();
    await store.set(storedFileName, fileBuffer);

    let result;
    try {
      [result] = await db.execute(
      `INSERT INTO tugas_pengumpulan (tugas_id, mahasiswa_id, mahasiswa_nama, file_name, catatan, tanggal)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (tugas_id, mahasiswa_id) DO UPDATE SET mahasiswa_nama = EXCLUDED.mahasiswa_nama, file_name = EXCLUDED.file_name, catatan = EXCLUDED.catatan, tanggal = EXCLUDED.tanggal
       RETURNING id`,
        [tugasId, studentId, finalNama, originalFileName, catatan || '', tanggal || new Date().toISOString().slice(0, 10)]
      );
      await db.execute(
        'UPDATE tugas_pengumpulan SET file_path = ? WHERE tugas_id = ? AND mahasiswa_id IS NOT DISTINCT FROM ?',
        [relativeFilePath, tugasId, studentId]
      );
    } catch (error) {
      await store.delete(storedFileName).catch((cleanupError) => {
        console.warn('Gagal menghapus file tugas sementara:', cleanupError.message);
      });
      throw error;
    }

    const existingFilePath = existingRows[0]?.file_path;
    if (existingFilePath && existingFilePath !== storedFileName) {
      await store.delete(existingFilePath).catch((error) => {
        console.warn('Gagal menghapus file tugas lama:', error.message);
      });
    }

    const [savedRows] = await db.execute(
      'SELECT id FROM tugas_pengumpulan WHERE tugas_id = ? AND mahasiswa_id IS NOT DISTINCT FROM ?',
      [tugasId, studentId]
    );
    res.status(201).json({
      id: savedRows[0]?.id || result.insertId,
      tugas_id: tugasId,
      mahasiswa_id: studentId,
      mahasiswa_nama: finalNama,
      file_name: originalFileName,
      download_url: `/api/submissions/${savedRows[0]?.id || result.insertId}/file`,
      catatan: catatan || '',
      tanggal: tanggal || new Date().toISOString().slice(0, 10),
      message: 'Tugas berhasil dikumpulkan',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/submissions/:id/file', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ message: 'ID pengumpulan tidak valid' });

    const db = await getDb();
    const query = req.auth.role === 'dosen'
      ? 'SELECT file_name, file_path FROM tugas_pengumpulan WHERE id = ?'
      : 'SELECT file_name, file_path FROM tugas_pengumpulan WHERE id = ? AND mahasiswa_id = ?';
    const [rows] = await db.execute(query, req.auth.role === 'dosen' ? [id] : [id, req.auth.id]);
    if (!rows.length || !rows[0].file_path) return res.status(404).json({ message: 'File pengumpulan tidak ditemukan' });

    const file = await getSubmissionStore().get(rows[0].file_path, { type: 'arrayBuffer' });
    if (!file) return res.status(404).json({ message: 'File pengumpulan tidak ditemukan' });

    res.attachment(rows[0].file_name);
    res.type('application/octet-stream');
    return res.send(Buffer.from(file));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/submissions', async (req, res) => {
  try {
    const db = await getDb();
    const isDosen = req.auth.role === 'dosen';
    const query = `
      SELECT s.id, s.tugas_id, s.mahasiswa_id, s.mahasiswa_nama, s.file_name, s.catatan, s.tanggal,
             t.judul AS tugas_judul
      FROM tugas_pengumpulan s
      INNER JOIN tugas t ON t.id = s.tugas_id
      ${isDosen ? '' : 'WHERE s.mahasiswa_id = ?'}
      ORDER BY s.created_at DESC
    `;
    const [rows] = await db.execute(query, isDosen ? [] : [req.auth.id]);
    res.json(rows.map((row) => ({
      ...row,
      download_url: `/api/submissions/${row.id}/file`,
    })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/nilai', async (req, res) => {
  try {
    const db = await getDb();
    const isDosen = req.auth.role === 'dosen';
    const [rows] = await db.execute(`
      SELECT n.*, mk.nama AS matakuliah_nama, t.judul AS judul_tugas
      FROM nilai n
      LEFT JOIN matakuliah mk ON mk.id = n.matakuliah_id
      LEFT JOIN tugas t ON t.id = n.tugas_id
      ${isDosen ? '' : 'WHERE n.mahasiswa_nama = (SELECT nama FROM mahasiswa WHERE id = ?)'}
      ORDER BY n.id ASC
    `, isDosen ? [] : [req.auth.id]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/nilai', async (req, res) => {
  try {
    const { mahasiswa_nama, tugas_id, matakuliah_id, nilai, feedback } = req.body;
    if (!mahasiswa_nama || nilai === undefined) {
      return res.status(400).json({ message: 'Nama mahasiswa dan nilai wajib diisi' });
    }
    const db = await getDb();
    const [result] = await db.execute(
      'INSERT INTO nilai (mahasiswa_nama, tugas_id, matakuliah_id, nilai, feedback) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [mahasiswa_nama, tugas_id || null, matakuliah_id || null, Number(nilai), feedback || '']
    );
    res.status(201).json({ id: result.insertId, mahasiswa_nama, nilai: Number(nilai) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/nilai/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { mahasiswa_nama, tugas_id, matakuliah_id, nilai, feedback } = req.body;
    if (!id || !mahasiswa_nama || nilai === undefined) {
      return res.status(400).json({ message: 'ID, nama mahasiswa, dan nilai wajib diisi' });
    }
    const db = await getDb();
    const [result] = await db.execute(
      'UPDATE nilai SET mahasiswa_nama = ?, tugas_id = ?, matakuliah_id = ?, nilai = ?, feedback = ? WHERE id = ?',
      [mahasiswa_nama, tugas_id || null, matakuliah_id || null, Number(nilai), feedback || '', id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Nilai tidak ditemukan' });
    res.json({ id, mahasiswa_nama, nilai: Number(nilai), message: 'Nilai berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/nilai/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID tidak valid' });
    const db = await getDb();
    const [result] = await db.execute('DELETE FROM nilai WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Nilai tidak ditemukan' });
    res.json({ message: 'Nilai berhasil dihapus', id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/pengumuman', async (req, res) => {
  try {
    const db = await getDb();
    const [rows] = await db.execute('SELECT * FROM pengumuman ORDER BY id ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/pengumuman', async (req, res) => {
  try {
    const { judul, isi, tanggal } = req.body;
    if (!judul || !isi) {
      return res.status(400).json({ message: 'Judul dan isi pengumuman wajib diisi' });
    }
    const db = await getDb();
    const [result] = await db.execute(
      'INSERT INTO pengumuman (judul, isi, tanggal) VALUES (?, ?, ?) RETURNING id',
      [judul, isi, tanggal || new Date().toISOString().slice(0, 10)]
    );
    res.status(201).json({ id: result.insertId, judul, isi });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put('/api/pengumuman/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { judul, isi, tanggal } = req.body;
    if (!id || !judul || !isi) return res.status(400).json({ message: 'ID, judul, dan isi pengumuman wajib diisi' });
    const db = await getDb();
    const [result] = await db.execute(
      'UPDATE pengumuman SET judul = ?, isi = ?, tanggal = ? WHERE id = ?',
      [judul, isi, tanggal || new Date().toISOString().slice(0, 10), id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Pengumuman tidak ditemukan' });
    res.json({ id, judul, isi, message: 'Pengumuman berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/api/pengumuman/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID tidak valid' });
    const db = await getDb();
    const [result] = await db.execute('DELETE FROM pengumuman WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Pengumuman tidak ditemukan' });
    res.json({ message: 'Pengumuman berhasil dihapus', id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = app;
