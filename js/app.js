const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const API_BASE = window.RUANGKELAS_API_BASE || '/api';

const defaultDB = {
  courses: [
    { id: 1, name: 'Implementasi dan Pengujian Perangkat Lunak', code: 'IPPL', lecturer: 'Dosen Pengampu', credits: 3 },
    { id: 2, name: 'Pemrograman Berbasis Objek', code: 'PBO', lecturer: 'Dosen Pengampu', credits: 3 },
    { id: 3, name: 'Machine Learning 1', code: 'ML1', lecturer: 'Dosen Pengampu', credits: 3 }
  ],
  materials: [
    { id: 1, title: 'Pengenalan SDLC dan MVP', course: 'Implementasi dan Pengujian Perangkat Lunak', type: 'PDF', date: '24 Sep 2026', desc: 'Pengenalan siklus pengembangan perangkat lunak dan konsep Minimum Viable Product.' },
    { id: 2, title: 'Analisis Kebutuhan Perangkat Lunak', course: 'Implementasi dan Pengujian Perangkat Lunak', type: 'PDF', date: '25 Sep 2026', desc: 'Kebutuhan fungsional, non-fungsional, dan pemodelan sistem.' },
    { id: 3, title: 'Konsep Class dan Object', course: 'Pemrograman Berbasis Objek', type: 'PDF', date: '22 Sep 2026', desc: 'Dasar OOP: class, object, attribute, method, dan encapsulation.' },
    { id: 4, title: 'Dasar Machine Learning', course: 'Machine Learning 1', type: 'PDF', date: '20 Sep 2026', desc: 'Konsep dasar supervised dan unsupervised learning.' }
  ],
  tasks: [
    { id: 1, title: 'Use Case Diagram Mini LMS', course: 'Implementasi dan Pengujian Perangkat Lunak', deadline: '30 Sep 2026', desc: 'Buat Use Case Diagram untuk sistem Mini LMS.', status: 'Belum dikumpulkan' },
    { id: 2, title: 'Activity Diagram', course: 'Implementasi dan Pengujian Perangkat Lunak', deadline: '07 Okt 2026', desc: 'Buat activity diagram untuk proses login dan pengumpulan tugas.', status: 'Belum dikumpulkan' },
    { id: 3, title: 'Prototype UI/UX', course: 'Implementasi dan Pengujian Perangkat Lunak', deadline: '14 Okt 2026', desc: 'Buat prototype interaktif halaman utama Mini LMS.', status: 'Belum dikumpulkan' }
  ],
  grades: [
    { id: 1, student: 'Nur Lutfia Amalia Khaisya', task: 'Use Case Diagram Mini LMS', course: 'Implementasi dan Pengujian Perangkat Lunak', score: 90, feedback: 'Struktur aktor dan use case sudah jelas.' },
    { id: 2, student: 'Nur Lutfia Amalia Khaisya', task: 'Activity Diagram', course: 'Implementasi dan Pengujian Perangkat Lunak', score: 88, feedback: 'Alur sudah baik, rapikan decision node.' }
  ],
  announcements: [
    { id: 1, title: 'Bimbingan Project Mingguan', date: '25 Sep 2026', content: 'Setiap kelompok membawa progress implementasi dan dokumen pengujian untuk dikonsultasikan.' },
    { id: 2, title: 'Pembagian Role Kelompok', date: '23 Sep 2026', content: 'Pastikan role System Analyst & UI/UX, Developer, dan QA/Tester sudah ditentukan.' },
    { id: 3, title: 'Fokus pada MVP', date: '20 Sep 2026', content: 'Aplikasi tidak perlu rumit. Prioritaskan fitur utama, minim bug, dan dokumentasi testing.' }
  ],
  submissions: []
};

let db = JSON.parse(localStorage.getItem('ruangKelasDB') || 'null') || defaultDB;
let accounts = JSON.parse(localStorage.getItem('ruangKelasUsers') || '[]');
if (!Array.isArray(accounts)) accounts = [];
let user = { name: '', role: 'mahasiswa' };
let ownerToken = localStorage.getItem('ruangKelasOwnerToken') || '';
let currentLoginRole = 'mahasiswa';
let forgotPasswordCountdown = 0;
let forgotPasswordTimer = null;

async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = sessionStorage.getItem('ruangKelasAuthToken');
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(payload && typeof payload === 'object' && payload.message ? payload.message : 'Request gagal');
  }

  return payload;
}

function save() {
  localStorage.setItem('ruangKelasDB', JSON.stringify(db));
}

function saveAccounts() {
  localStorage.setItem('ruangKelasUsers', JSON.stringify(accounts));
}

function uid(arr) {
  return arr.length ? Math.max(...arr.map((x) => Number(x.id) || 0)) + 1 : 1;
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function togglePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input || !button) return;

  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  button.textContent = isPassword ? 'Sembunyikan' : 'Lihat';
  button.setAttribute('aria-label', isPassword ? 'Sembunyikan password' : 'Lihat password');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

function today() {
  return new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

async function loadServerData() {
  try {
    const [matakuliah, materi, tugas, nilai, pengumuman, submissions] = await Promise.all([
      apiRequest('/matakuliah'),
      apiRequest('/materi'),
      apiRequest('/tugas'),
      apiRequest('/nilai'),
      apiRequest('/pengumuman'),
      apiRequest('/submissions'),
    ]);

    if (Array.isArray(matakuliah)) {
      db.courses = matakuliah.map((item) => ({
        id: item.id,
        name: item.nama,
        code: item.kode,
        lecturer: 'Dosen Pengampu',
        credits: Number(item.sks) || 3,
      }));
    }

    if (Array.isArray(materi)) {
      db.materials = materi.map((item) => ({
        id: item.id,
        title: item.judul,
        course: item.matakuliah_nama || item.matakuliah || '',
        type: item.tipe || 'PDF',
        date: item.tanggal || '-',
        desc: item.deskripsi || '',
      }));
    }

    if (Array.isArray(tugas)) {
      db.tasks = tugas.map((item) => ({
        id: item.id,
        title: item.judul,
        course: item.matakuliah_nama || item.matakuliah || '',
        deadline: item.deadline || '-',
        desc: item.deskripsi || '',
        status: item.status || 'Belum dikumpulkan',
      }));
    }

    if (Array.isArray(nilai)) {
      db.grades = nilai.map((item) => ({
        id: item.id,
        student: item.mahasiswa_nama || item.nama_mahasiswa || item.student || '-',
        task: item.judul_tugas || item.task || '-',
        course: item.matakuliah_nama || item.course || '',
        score: Number(item.nilai) || 0,
        feedback: item.feedback || '-',
      }));
    }

    if (Array.isArray(pengumuman)) {
      db.announcements = pengumuman.map((item) => ({
        id: item.id,
        title: item.judul,
        date: item.tanggal || '-',
        content: item.isi || '',
      }));
    }

    if (Array.isArray(submissions)) {
      db.submissions = submissions.map((item) => ({
        id: item.id,
        taskId: item.tugas_id,
        task: item.tugas_judul,
        studentId: item.mahasiswa_id,
        student: item.mahasiswa_nama,
        file: item.file_name,
        note: item.catatan || '',
        date: item.tanggal || '-',
        downloadUrl: item.download_url,
      }));
    }

    save();
  } catch (error) {
    console.warn('Gagal memuat data dari server, memakai data lokal:', error.message);
    throw error;
  }
}

const navStudent = [
  ['dashboard', '▦', 'Dashboard'],
  ['courses', '▤', 'Mata Kuliah'],
  ['materials', '▣', 'Materi'],
  ['tasks', '✓', 'Tugas'],
  ['grades', '★', 'Nilai'],
  ['announcements', '◈', 'Pengumuman']
];

const navLecturer = [
  ['dashboard', '▦', 'Dashboard'],
  ['courses', '▤', 'Mata Kuliah'],
  ['materials', '▣', 'Kelola Materi'],
  ['tasks', '✓', 'Kelola Tugas'],
  ['grades', '★', 'Kelola Nilai'],
  ['announcements', '◈', 'Pengumuman']
];

function buildNav() {
  const nav = user.role === 'dosen' ? navLecturer : navStudent;
  $('#sidebarNav').innerHTML = nav.map(([page, icon, title]) => `<button class="nav-btn" data-page="${page}">${icon} &nbsp; ${title}</button>`).join('');
  $$('#sidebarNav .nav-btn').forEach((btn) => {
    btn.onclick = () => {
      render(btn.dataset.page);
      $('#sidebarNav').parentElement.classList.remove('open');
    };
  });
}

// Admin approval UI (owner only). Accessible from login page via button.
// Dosen yang sudah login memakai sesinya; selain itu diminta OWNER TOKEN.
function isLecturerSession() {
  return user.role === 'dosen' && !!sessionStorage.getItem('ruangKelasAuthToken');
}

function adminHeaders() {
  return isLecturerSession() ? {} : { 'x-owner-token': ownerToken };
}

async function showAdminPanel() {
  if (!isLecturerSession()) {
    const token = prompt('Masukkan OWNER TOKEN untuk akses admin:');
    if (!token) return toast('Token diperlukan');
    ownerToken = token;
    localStorage.setItem('ruangKelasOwnerToken', ownerToken);
  }

  if (!(await waitForBackend())) return toast('Server tidak tersedia');

  try {
    const list = await apiRequest('/pending-registrations', { headers: adminHeaders() });
    openModal(`<div class="modal-head"><h3>Daftar Pendaftar (Pending)</h3><button class="close" onclick="closeModal()">✕</button></div><div id="pendingList">${list.length ? list.map((p) => `<div style="padding:8px;border-bottom:1px solid #eee"><b>${esc(p.nama)}</b> — ${esc(p.nim)}<br>${esc(p.email)}<div style="margin-top:6px"><button class="btn small" onclick="approve(${p.id})">Setujui</button></div></div>`).join('') : '<p>Tidak ada pendaftar.'}</div>
      <h3 style="margin-top:18px">Tambah Akun Dosen</h3>
      <form id="ownerDosenForm" class="auth-form">
        <input id="ownerDosenNama" required maxlength="100" placeholder="Nama dosen">
        <input id="ownerDosenNip" required maxlength="30" placeholder="NIP">
        <input id="ownerDosenEmail" type="email" required maxlength="100" placeholder="Email">
        <input id="ownerDosenPassword" type="password" minlength="8" required autocomplete="new-password" placeholder="Password (minimal 8 karakter)">
        <button class="btn primary full" type="submit">Simpan dosen</button>
      </form>`);
    $('#ownerDosenForm').onsubmit = addDosenAsOwner;
  } catch (error) {
    toast(error.message || 'Gagal memuat daftar pendaftar');
  }
}

async function addDosenAsOwner(event) {
  event.preventDefault();
  try {
    await apiRequest('/dosen', {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        nama: $('#ownerDosenNama').value.trim(),
        nip: $('#ownerDosenNip').value.trim(),
        email: $('#ownerDosenEmail').value.trim(),
        password: $('#ownerDosenPassword').value,
      }),
    });
    toast('Akun dosen berhasil dibuat');
    $('#ownerDosenForm').reset();
  } catch (error) {
    toast(error.message || 'Gagal menambahkan dosen');
  }
}

async function approve(id) {
  if (!isLecturerSession() && !ownerToken) return toast('Token owner hilang, buka ulang admin panel');
  try {
    await apiRequest(`/approve/${id}`, { method: 'POST', headers: adminHeaders() });
    toast('Mahasiswa disetujui');
    const list = await apiRequest('/pending-registrations', { headers: adminHeaders() });
    const html = list.length ? list.map((p) => `<div style="padding:8px;border-bottom:1px solid #eee"><b>${esc(p.nama)}</b> — ${esc(p.nim)}<br>${esc(p.email)}<div style="margin-top:6px"><button class="btn small" onclick="approve(${p.id})">Setujui</button></div></div>`).join('') : '<p>Tidak ada pendaftar.';
    const pendingList = $('#modal').querySelector('#pendingList');
    if (pendingList) pendingList.innerHTML = html;
  } catch (error) {
    toast(error.message || 'Gagal menyetujui mahasiswa');
  }
}

function render(page = 'dashboard') {
  buildNav();
  $$('#sidebarNav .nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.page === page));
  const labels = {
    dashboard: 'Dashboard',
    courses: 'Mata Kuliah',
    materials: user.role === 'dosen' ? 'Kelola Materi' : 'Materi',
    tasks: user.role === 'dosen' ? 'Kelola Tugas' : 'Tugas',
    grades: user.role === 'dosen' ? 'Kelola Nilai' : 'Nilai',
    announcements: 'Pengumuman',
  };

  $('#pageTitle').textContent = labels[page] || 'Dashboard';
  const map = {
    dashboard: renderDashboard,
    courses: renderCourses,
    materials: renderMaterials,
    tasks: renderTasks,
    grades: renderGrades,
    announcements: renderAnnouncements,
  };
  (map[page] || renderDashboard)();
}

function stats() {
  return `
    <div class="stats">
      <div class="stat"><div class="stat-top"><span>Mata Kuliah</span><span class="stat-icon">📚</span></div><strong>${db.courses.length}</strong><small>tersedia</small></div>
      <div class="stat"><div class="stat-top"><span>Materi</span><span class="stat-icon">📄</span></div><strong>${db.materials.length}</strong><small>materi aktif</small></div>
      <div class="stat"><div class="stat-top"><span>Tugas</span><span class="stat-icon">✓</span></div><strong>${db.tasks.length}</strong><small>tugas aktif</small></div>
      <div class="stat"><div class="stat-top"><span>Pengumuman</span><span class="stat-icon">🔔</span></div><strong>${db.announcements.length}</strong><small>informasi</small></div>
    </div>
  `;
}

function renderDashboard() {
  const latest = db.announcements.slice(-3).reverse();
  $('#pageContent').innerHTML = `
  <div class="welcome"><div><h1>Halo, ${esc(user.name)}! 👋</h1><p>Selamat datang di RuangKelas. Semua aktivitas pembelajaran ada di satu tempat.</p></div><div class="welcome-icon">🎓</div></div>
  ${stats()}
  ${user.role === 'dosen' && sessionStorage.getItem('ruangKelasAuthToken') ? '<div class="section-head"><div><h3>Pendaftar Baru</h3><p>Setujui akun mahasiswa dan tambah akun dosen.</p></div><button class="btn primary" onclick="showAdminPanel()">Verifikasi Pendaftar</button></div>' : ''}
  <div class="section-head"><div><h3>Pengumuman Terbaru</h3><p>Informasi penting dari dosen</p></div><button class="btn secondary" onclick="render('announcements')">Lihat semua</button></div>
  <div class="timeline">${latest.map((a) => `<div class="item"><div class="timeline-date">${esc(a.date)}</div><div><h4>${esc(a.title)}</h4><p>${esc(a.content)}</p></div></div>`).join('')}</div>
  <div class="section-head"><div><h3>${user.role === 'dosen' ? 'Ringkasan Pengelolaan' : 'Tugas Mendatang'}</h3></div></div>
  <div class="grid">${db.tasks.slice(0, 3).map((t) => {
    const status = user.role === 'mahasiswa'
      ? (taskSubmittedByCurrentUser(t.id) ? 'Sudah dikumpulkan' : 'Belum dikumpulkan')
      : t.status;
    return `<div class="item"><span class="tag orange">${esc(t.deadline)}</span><h4>${esc(t.title)}</h4><p>${esc(t.course)}</p><div class="progress"><span style="width:${status === 'Sudah dikumpulkan' ? 100 : 35}%"></span></div><p style="font-size:11px;margin-top:7px">${esc(status)}</p></div>`;
  }).join('')}</div>`;
}

function taskSubmittedByCurrentUser(taskId) {
  return db.submissions.some((submission) =>
    Number(submission.taskId) === Number(taskId)
    && Number(submission.studentId) === Number(user.id)
  );
}

function renderCourses() {
  $('#pageContent').innerHTML = `
  <div class="section-head"><div><h3>Daftar Mata Kuliah</h3><p>${user.role === 'dosen' ? 'Kelola mata kuliah yang diajar.' : 'Mata kuliah yang tersedia di RuangKelas.'}</p></div>${user.role === 'dosen' ? '<div class="action-row"><button class="btn primary" onclick="courseModal()">+ Tambah Mata Kuliah</button><button class="btn secondary" onclick="bulkCourseModal()">+ Tambah Banyak</button></div>' : ''}</div>
  <div class="grid">${db.courses.map((c) => `<div class="item"><span class="tag">${esc(c.code)}</span><h4>${esc(c.name)}</h4><p><b>Dosen:</b> ${esc(c.lecturer)}</p><p><b>SKS:</b> ${c.credits}</p>${user.role === 'dosen' ? `<div class="action-row"><button class="btn small secondary" onclick="courseModal(${c.id})">Edit</button><button class="btn small danger" onclick="removeItem('courses',${c.id},'Mata kuliah')">Hapus</button></div>` : ''}</div>`).join('')}</div>`;
}

function renderMaterials() {
  $('#pageContent').innerHTML = `
  <div class="section-head"><div><h3>${user.role === 'dosen' ? 'Kelola Materi' : 'Materi Pembelajaran'}</h3><p>${db.materials.length} materi tersedia</p></div>${user.role === 'dosen' ? '<button class="btn primary" onclick="materialModal()">+ Tambah Materi</button>' : ''}</div>
  <div class="grid">${db.materials.map((m) => `<div class="item"><span class="tag">${esc(m.type)}</span><h4>${esc(m.title)}</h4><p><b>${esc(m.course)}</b></p><p>${esc(m.desc)}</p><p style="font-size:11px">Diunggah: ${esc(m.date)}</p><div class="action-row">${user.role === 'mahasiswa' ? '<button class="btn small secondary" onclick="toast(\'Materi siap dibuka pada versi backend.\')">Buka Materi</button>' : `<button class="btn small secondary" onclick="materialModal(${m.id})">Edit</button><button class="btn small danger" onclick="removeItem('materials',${m.id},'Materi')">Hapus</button>`}</div></div>`).join('')}</div>`;
}

function renderTasks() {
  const isD = user.role === 'dosen';
  $('#pageContent').innerHTML = `
  <div class="section-head"><div><h3>${isD ? 'Kelola Tugas' : 'Daftar Tugas'}</h3><p>${isD ? 'Buat dan kelola tugas mahasiswa.' : 'Tugas yang harus diselesaikan.'}</p></div>${isD ? '<button class="btn primary" onclick="taskModal()">+ Buat Tugas</button>' : ''}</div>
  <div class="table-wrap"><table><thead><tr><th>Tugas</th><th>Mata Kuliah</th><th>Deadline</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
  ${db.tasks.map((t) => {
    const status = isD ? t.status : (taskSubmittedByCurrentUser(t.id) ? 'Sudah dikumpulkan' : 'Belum dikumpulkan');
    return `<tr><td><b>${esc(t.title)}</b><br><small>${esc(t.desc)}</small></td><td>${esc(t.course)}</td><td>${esc(t.deadline)}</td><td><span class="tag ${status === 'Sudah dikumpulkan' ? 'green' : 'orange'}">${esc(status)}</span></td><td><div class="action-row">${isD ? `<button class="btn small secondary" onclick="taskModal(${t.id})">Edit</button><button class="btn small danger" onclick="removeItem('tasks',${t.id},'Tugas')">Hapus</button>` : `<button class="btn small primary" onclick="submitModal(${t.id})">Kumpulkan</button>`}</div></td></tr>`;
  }).join('')}
  </tbody></table></div>
  <div class="section-head"><div><h3>${isD ? 'Pengumpulan Mahasiswa' : 'File yang Dikumpulkan'}</h3><p>${db.submissions.length} pengumpulan tersimpan</p></div></div>
  <div class="table-wrap"><table><thead><tr>${isD ? '<th>Mahasiswa</th>' : ''}<th>Tugas</th><th>File</th><th>Tanggal</th><th>Catatan</th><th>Aksi</th></tr></thead><tbody>
  ${db.submissions.map((submission) => `<tr>${isD ? `<td>${esc(submission.student)}</td>` : ''}<td>${esc(submission.task || db.tasks.find((task) => task.id === submission.taskId)?.title || '-')}</td><td>${esc(submission.file)}</td><td>${esc(submission.date)}</td><td>${esc(submission.note || '-')}</td><td><button class="btn small secondary" onclick="downloadSubmission(${submission.id})">Unduh</button></td></tr>`).join('')}
  </tbody></table></div>`;
}

function renderGrades() {
  if (user.role === 'dosen') {
    $('#pageContent').innerHTML = `
    <div class="section-head"><div><h3>Kelola Nilai</h3><p>Berikan nilai dan feedback kepada mahasiswa.</p></div><button class="btn primary" onclick="gradeModal()">+ Tambah Nilai</button></div>
    <div class="table-wrap"><table><thead><tr><th>Mahasiswa</th><th>Tugas</th><th>Mata Kuliah</th><th>Nilai</th><th>Feedback</th><th>Aksi</th></tr></thead><tbody>${db.grades.map((g) => `<tr><td>${esc(g.student)}</td><td>${esc(g.task)}</td><td>${esc(g.course)}</td><td class="score">${g.score}</td><td>${esc(g.feedback || '-')}</td><td><button class="btn small danger" onclick="removeItem('grades',${g.id},'Nilai')">Hapus</button></td></tr>`).join('')}</tbody></table></div>`;
  } else {
    const my = db.grades.filter((g) => g.student === user.name);
    const avg = my.length ? Math.round(my.reduce((a, b) => a + b.score, 0) / my.length) : 0;
    $('#pageContent').innerHTML = `
    <div class="stats"><div class="stat"><div class="stat-top"><span>Rata-rata</span><span class="stat-icon">★</span></div><strong>${avg}</strong><small>dari ${my.length} nilai</small></div><div class="stat"><div class="stat-top"><span>Tugas Dinilai</span><span class="stat-icon">✓</span></div><strong>${my.length}</strong><small>tugas</small></div></div>
    <div class="section-head"><div><h3>Hasil Penilaian</h3><p>Nilai dan feedback dari dosen.</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>Tugas</th><th>Mata Kuliah</th><th>Nilai</th><th>Feedback</th></tr></thead><tbody>${my.map((g) => `<tr><td>${esc(g.task)}</td><td>${esc(g.course)}</td><td class="score">${g.score}</td><td>${esc(g.feedback || '-')}</td></tr>`).join('')}</tbody></table></div>`;
  }
}

function renderAnnouncements() {
  $('#pageContent').innerHTML = `
  <div class="section-head"><div><h3>Pengumuman</h3><p>Informasi terbaru dari ruang kelas.</p></div>${user.role === 'dosen' ? '<button class="btn primary" onclick="announcementModal()">+ Buat Pengumuman</button>' : ''}</div>
  <div class="grid two">${db.announcements.slice().reverse().map((a) => `<div class="item"><span class="tag">${esc(a.date)}</span><h4>${esc(a.title)}</h4><p>${esc(a.content)}</p>${user.role === 'dosen' ? `<div class="action-row"><button class="btn small secondary" onclick="announcementModal(${a.id})">Edit</button><button class="btn small danger" onclick="removeItem('announcements',${a.id},'Pengumuman')">Hapus</button></div>` : ''}</div>`).join('')}</div>`;
}

function openModal(html) {
  $('#modal').innerHTML = html;
  $('#modalBackdrop').classList.remove('hidden');
}

function closeModal() {
  $('#modalBackdrop').classList.add('hidden');
}

$('#modalBackdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modalBackdrop') closeModal();
});

function modalShell(title, body, submit) {
  openModal(`<div class="modal-head"><h3>${title}</h3><button class="close" onclick="closeModal()">✕</button></div>${body}<div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Batal</button><button class="btn primary" onclick="${submit}">Simpan</button></div>`);
}

function courseModal(id = null) {
  const c = id ? db.courses.find((x) => x.id === id) : {};
  modalShell(id ? 'Edit Mata Kuliah' : 'Tambah Mata Kuliah', `<label>Nama Mata Kuliah</label><input id="fName" value="${esc(c.name || '')}"><label>Kode</label><input id="fCode" value="${esc(c.code || '')}"><label>Dosen</label><input id="fLecturer" value="${esc(c.lecturer || 'Dosen Pengampu')}"><label>SKS</label><input id="fCredits" type="number" value="${c.credits || 3}">`, `saveCourse(${id || 'null'})`);
}

async function saveCourse(id) {
  const x = {
    name: $('#fName').value,
    code: $('#fCode').value,
    lecturer: $('#fLecturer').value,
    credits: Number($('#fCredits').value) || 3,
  };

  if (!x.name || !x.code) return toast('Nama dan kode wajib diisi');

  const payload = { nama: x.name, kode: x.code, sks: x.credits };
  let saved = null;
  if (window.isBackendReady) {
    try {
      saved = await apiRequest(id ? `/matakuliah/${id}` : '/matakuliah', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      return toast(error.message || 'Gagal menyimpan mata kuliah');
    }
  }

  const course = { id: saved?.id ?? id ?? uid(db.courses), ...x };
  if (id) {
    const index = db.courses.findIndex((item) => item.id === id);
    if (index !== -1) db.courses[index] = course;
  } else {
    db.courses.push(course);
  }

  save();
  closeModal();
  render('courses');
  toast('Mata kuliah berhasil disimpan');
}

function bulkCourseModal() {
  modalShell('Tambah Banyak Mata Kuliah', `
    <label>Format tiap baris</label>
    <div class="helper" style="margin:0 0 8px; color:#9cc7ff; font-size:12px;">Contoh: <strong>Nama Mata Kuliah | Kode | SKS</strong></div>
    <textarea id="fBulkCourses" rows="12" placeholder="Algoritma dan Struktur Data | ASD | 3\nBasis Data | BD | 3\nJaringan Komputer | JK | 2"></textarea>
  `, 'saveBulkCourses()');
}

async function saveBulkCourses() {
  const raw = $('#fBulkCourses').value.trim();
  if (!raw) return toast('Masukkan minimal satu mata kuliah');

  const rows = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const items = rows.map((row) => {
    const parts = row.split('|').map((part) => part.trim());
    const name = parts[0] || '';
    const code = (parts[1] || name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()) || '';
    const credits = Number(parts[2] || 3);
    return { name, code, lecturer: 'Dosen Pengampu', credits: Number.isFinite(credits) && credits > 0 ? credits : 3 };
  }).filter((item) => item.name && item.code);

  if (!items.length) return toast('Format salah. Gunakan Nama | Kode | SKS');

  if (window.isBackendReady) {
    try {
      await apiRequest('/matakuliah/bulk', {
        method: 'POST',
        body: JSON.stringify({
          items: items.map((course) => ({ nama: course.name, kode: course.code, sks: course.credits })),
        }),
      });
      await loadServerData();
    } catch (error) {
      return toast(error.message || 'Gagal menambah banyak mata kuliah');
    }
  } else {
    db.courses.push(...items.map((item) => ({ id: uid(db.courses), ...item })));
  }

  save();
  closeModal();
  render('courses');
  toast(`${items.length} mata kuliah berhasil ditambahkan`);
}

function materialModal(id = null) {
  const m = id ? db.materials.find((x) => x.id === id) : {};
  modalShell(id ? 'Edit Materi' : 'Tambah Materi', `<label>Judul Materi</label><input id="fTitle" value="${esc(m.title || '')}"><label>Mata Kuliah</label><select id="fCourse">${db.courses.map((c) => `<option ${m.course === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><label>Tipe File</label><select id="fType"><option ${m.type === 'PDF' ? 'selected' : ''}>PDF</option><option ${m.type === 'PPT' ? 'selected' : ''}>PPT</option><option ${m.type === 'DOC' ? 'selected' : ''}>DOC</option></select><label>Deskripsi</label><textarea id="fDesc">${esc(m.desc || '')}</textarea>`, `saveMaterial(${id || 'null'})`);
}

async function saveMaterial(id) {
  const x = {
    title: $('#fTitle').value,
    course: $('#fCourse').value,
    type: $('#fType').value,
    desc: $('#fDesc').value,
    date: today(),
  };

  if (!x.title) return toast('Judul materi wajib diisi');

  const selectedCourse = db.courses.find((c) => c.name === x.course);
  const payload = {
    matakuliah_id: selectedCourse ? selectedCourse.id : null,
    judul: x.title,
    tipe: x.type,
    deskripsi: x.desc,
    tanggal: new Date().toISOString().slice(0, 10),
  };
  let saved = null;
  if (window.isBackendReady) {
    try {
      saved = await apiRequest(id ? `/materi/${id}` : '/materi', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      return toast(error.message || 'Gagal menyimpan materi');
    }
  }

  const material = { id: saved?.id ?? id ?? uid(db.materials), ...x };
  if (id) {
    const index = db.materials.findIndex((item) => item.id === id);
    if (index !== -1) db.materials[index] = material;
  } else {
    db.materials.push(material);
  }

  save();
  closeModal();
  render('materials');
  toast('Materi berhasil disimpan');
}

function taskModal(id = null) {
  const t = id ? db.tasks.find((x) => x.id === id) : {};
  modalShell(id ? 'Edit Tugas' : 'Buat Tugas', `<label>Judul Tugas</label><input id="fTitle" value="${esc(t.title || '')}"><label>Mata Kuliah</label><select id="fCourse">${db.courses.map((c) => `<option ${t.course === c.name ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><label>Deadline</label><input id="fDeadline" type="date" value="${id ? isoDate(t.deadline) : ''}"><label>Deskripsi</label><textarea id="fDesc">${esc(t.desc || '')}</textarea>`, `saveTask(${id || 'null'})`);
}

function isoDate(s) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

async function saveTask(id) {
  const raw = $('#fDeadline').value;
  const date = raw ? new Date(`${raw}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const old = id ? db.tasks.find((t) => t.id === id) : {};
  const x = {
    title: $('#fTitle').value,
    course: $('#fCourse').value,
    deadline: date,
    desc: $('#fDesc').value,
    status: old.status || 'Belum dikumpulkan',
  };

  if (!x.title) return toast('Judul tugas wajib diisi');

  const selectedCourse = db.courses.find((c) => c.name === x.course);
  const payload = {
    matakuliah_id: selectedCourse ? selectedCourse.id : null,
    judul: x.title,
    deadline: raw || null,
    deskripsi: x.desc,
    status: x.status,
  };
  let saved = null;
  if (window.isBackendReady) {
    try {
      saved = await apiRequest(id ? `/tugas/${id}` : '/tugas', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      return toast(error.message || 'Gagal menyimpan tugas');
    }
  }

  const task = { id: saved?.id ?? id ?? uid(db.tasks), ...x };
  if (id) {
    const index = db.tasks.findIndex((item) => item.id === id);
    if (index !== -1) db.tasks[index] = task;
  } else {
    db.tasks.push(task);
  }

  save();
  closeModal();
  render('tasks');
  toast('Tugas berhasil disimpan');
}

function submitModal(taskId) {
  const t = db.tasks.find((x) => x.id === taskId);
  openModal(`<div class="modal-head"><h3>Kumpulkan Tugas</h3><button class="close" onclick="closeModal()">✕</button></div><p><b>${esc(t.title)}</b></p><label>File Tugas</label><input id="fFile" type="file"><label>Catatan</label><textarea id="fNote" placeholder="Catatan untuk dosen (opsional)"></textarea><div class="modal-actions"><button class="btn ghost" onclick="closeModal()">Batal</button><button class="btn primary" onclick="submitTask(${taskId})">Kirim Tugas</button></div>`);
}

async function submitTask(taskId) {
  const f = $('#fFile').files[0];
  if (!f) return toast('Pilih file terlebih dahulu');
  if (f.size > 4 * 1024 * 1024) return toast('Ukuran file maksimal 4 MB');
  if (!window.isBackendReady || !user.id) {
    return toast('Server dan akun mahasiswa diperlukan untuk mengumpulkan file');
  }

  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) return toast('Tugas tidak ditemukan');

  try {
    const fileContent = await fileToBase64(f);
    const submission = await apiRequest(`/tugas/${taskId}/kumpulkan`, {
      method: 'POST',
      body: JSON.stringify({
        mahasiswa_id: user.id,
        mahasiswa_nama: user.name,
        file_name: f.name,
        file_content: fileContent,
        catatan: $('#fNote').value,
        tanggal: new Date().toISOString().slice(0, 10),
      }),
    });

    const submissionDetails = {
      id: submission.id,
      taskId,
      studentId: user.id,
      student: user.name,
      file: f.name,
      note: $('#fNote').value,
      date: today(),
      downloadUrl: submission.download_url,
    };
    const existingIndex = db.submissions.findIndex((item) =>
      Number(item.taskId) === Number(taskId)
      && Number(item.studentId) === Number(user.id)
    );
    if (existingIndex === -1) db.submissions.push(submissionDetails);
    else db.submissions[existingIndex] = submissionDetails;
    save();
    closeModal();
    render('tasks');
    toast('Tugas berhasil dikumpulkan');
  } catch (error) {
    toast(error.message || 'Gagal mengumpulkan tugas');
  }
}

function fileToBase64(file) {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    const chunks = [];
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
    }
    return btoa(chunks.join(''));
  });
}

async function downloadSubmission(id) {
  const token = sessionStorage.getItem('ruangKelasAuthToken');
  try {
    const response = await fetch(`${API_BASE}/submissions/${id}/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || 'Gagal mengunduh file');
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const disposition = response.headers.get('content-disposition') || '';
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename || `pengumpulan-${id}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch (error) {
    toast(error.message || 'Gagal mengunduh file');
  }
}

function gradeModal() {
  modalShell('Tambah Nilai', `<label>Nama Mahasiswa</label><input id="fStudent" value=""><label>Tugas</label><select id="fTask">${db.tasks.map((t) => `<option>${esc(t.title)}</option>`).join('')}</select><label>Nilai (0-100)</label><input id="fScore" type="number" min="0" max="100"><label>Feedback</label><textarea id="fFeedback"></textarea>`, 'saveGrade()');
}

async function saveGrade() {
  const task = db.tasks.find((t) => t.title === $('#fTask').value);
  const score = Number($('#fScore').value);

  if (!$('#fStudent').value || !task || score < 0 || score > 100) return toast('Lengkapi data nilai');

  const grade = {
    student: $('#fStudent').value,
    task: task.title,
    course: task.course,
    score,
    feedback: $('#fFeedback').value,
  };

  if (window.isBackendReady) {
    const selectedCourse = db.courses.find((c) => c.name === task.course);
    try {
      const saved = await apiRequest('/nilai', {
        method: 'POST',
        body: JSON.stringify({
          mahasiswa_nama: grade.student,
          tugas_id: task.id,
          matakuliah_id: selectedCourse ? selectedCourse.id : null,
          nilai: score,
          feedback: grade.feedback,
        }),
      });
      grade.id = saved.id;
    } catch (error) {
      return toast(error.message || 'Gagal menyimpan nilai');
    }
  } else {
    grade.id = uid(db.grades);
  }

  db.grades.push(grade);
  save();
  closeModal();
  render('grades');
  toast('Nilai berhasil ditambahkan');
}

function announcementModal(id = null) {
  const a = id ? db.announcements.find((x) => x.id === id) : {};
  modalShell(id ? 'Edit Pengumuman' : 'Buat Pengumuman', `<label>Judul</label><input id="fTitle" value="${esc(a.title || '')}"><label>Isi Pengumuman</label><textarea id="fContent">${esc(a.content || '')}</textarea>`, `saveAnnouncement(${id || 'null'})`);
}

async function saveAnnouncement(id) {
  const x = {
    title: $('#fTitle').value,
    content: $('#fContent').value,
    date: today(),
  };

  if (!x.title || !x.content) return toast('Judul dan isi wajib diisi');

  const payload = {
    judul: x.title,
    isi: x.content,
    tanggal: new Date().toISOString().slice(0, 10),
  };
  let saved = null;
  if (window.isBackendReady) {
    try {
      saved = await apiRequest(id ? `/pengumuman/${id}` : '/pengumuman', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
    } catch (error) {
      return toast(error.message || 'Gagal menyimpan pengumuman');
    }
  }

  const announcement = { id: saved?.id ?? id ?? uid(db.announcements), ...x };
  if (id) {
    const index = db.announcements.findIndex((item) => item.id === id);
    if (index !== -1) db.announcements[index] = announcement;
  } else {
    db.announcements.push(announcement);
  }

  save();
  closeModal();
  render('announcements');
  toast('Pengumuman berhasil disimpan');
}

async function removeItem(type, id, label) {
  if (!confirm(`Hapus ${label} ini?`)) return;

  const endpoints = {
    courses: '/matakuliah',
    materials: '/materi',
    tasks: '/tugas',
    grades: '/nilai',
    announcements: '/pengumuman',
  };

  if (window.isBackendReady && endpoints[type]) {
    try {
      await apiRequest(`${endpoints[type]}/${id}`, { method: 'DELETE' });
    } catch (error) {
      return toast(error.message || `Gagal menghapus ${label.toLowerCase()}`);
    }
  }

  db[type] = db[type].filter((x) => x.id !== id);
  save();
  render(type === 'materials' ? 'materials' : type === 'tasks' ? 'tasks' : type === 'courses' ? 'courses' : type === 'grades' ? 'grades' : 'announcements');
  toast(label + ' berhasil dihapus');
}

function setAuthMode(mode) {
  const isLogin = mode === 'login';
  $('#registerForm').classList.toggle('hidden', isLogin);
  $('#loginForm').classList.toggle('hidden', !isLogin);
  $('#authTitle').textContent = isLogin ? 'Masuk ke RuangKelas' : 'Buat akun RuangKelas';
  $('#authDescription').textContent = isLogin ? 'Masukkan NIM atau NIP Anda beserta password untuk masuk otomatis ke role yang sesuai.' : 'Daftar sebagai mahasiswa. Akun akan diverifikasi oleh pemilik/dosen.';
  $('#authSwitch').innerHTML = isLogin ? '<span>Belum punya akun?</span> <button type="button" id="showRegisterBtn">Buat akun</button>' : '<span>Sudah punya akun?</span> <button type="button" id="showLoginBtn">Masuk</button>';
  const nextButton = $('#authSwitch button');
  nextButton.onclick = () => setAuthMode(isLogin ? 'register' : 'login');
}

function startForgotPasswordCountdown(seconds = 60) {
  forgotPasswordCountdown = seconds;

  if (forgotPasswordTimer) clearInterval(forgotPasswordTimer);

  const resendBtn = $('#forgotPasswordResendBtn');
  const render = () => {
    if (!resendBtn) return;
    if (forgotPasswordCountdown > 0) {
      resendBtn.disabled = true;
      resendBtn.textContent = `Kirim ulang (${forgotPasswordCountdown}s)`;
      forgotPasswordCountdown -= 1;
      return;
    }

    resendBtn.disabled = false;
    resendBtn.textContent = 'Kirim ulang kode';
    clearInterval(forgotPasswordTimer);
    forgotPasswordTimer = null;
  };

  render();
  forgotPasswordTimer = setInterval(render, 1000);
}

function toggleForgotPasswordStep(step) {
  const step1 = $('#forgotPasswordStep1');
  const step2 = $('#forgotPasswordStep2');
  const step3 = $('#forgotPasswordStep3');

  if (step1) step1.classList.toggle('hidden', step !== 1);
  if (step2) step2.classList.toggle('hidden', step !== 2);
  if (step3) step3.classList.toggle('hidden', step !== 3);
}

function openForgotPasswordModal() {
  openModal(`
    <div class="modal-head">
      <h3>Reset Password</h3>
      <button class="close" onclick="closeModal()">✕</button>
    </div>
    <div style="display:grid;gap:12px;">
      <div id="forgotPasswordStep1" style="display:grid;gap:12px;">
        <div style="display:grid;gap:8px;">
          <label>Role Akun</label>
          <select id="fResetRole">
            <option value="mahasiswa" ${currentLoginRole === 'dosen' ? '' : 'selected'}>Mahasiswa</option>
            <option value="dosen" ${currentLoginRole === 'dosen' ? 'selected' : ''}>Dosen</option>
          </select>
        </div>
        <div style="display:grid;gap:8px;">
          <label id="fResetIdentifierLabel">NIM</label>
          <input id="fResetIdentifier" placeholder="Masukkan NIM">
        </div>
        <div style="display:grid;gap:8px;">
          <label>Email</label>
          <input id="fResetEmail" type="email" placeholder="Masukkan email akun">
        </div>
        <button type="button" class="btn primary" onclick="sendForgotPasswordCode()">Kirim Kode Verifikasi</button>
      </div>

      <div id="forgotPasswordStep2" class="hidden" style="display:grid;gap:12px;">
        <div style="display:grid;gap:8px;">
          <label>Kode Verifikasi</label>
          <input id="fResetCode" type="text" maxlength="6" placeholder="Masukkan 6 digit kode">
        </div>
        <div class="modal-actions">
          <button type="button" class="btn ghost" onclick="verifyForgotPasswordCode()">Verifikasi Kode</button>
          <button id="forgotPasswordResendBtn" type="button" class="btn ghost" onclick="sendForgotPasswordCode()">Kirim ulang kode</button>
        </div>
      </div>

      <div id="forgotPasswordStep3" class="hidden" style="display:grid;gap:12px;">
        <div style="display:grid;gap:8px;">
          <label>Password Baru</label>
          <input id="fResetPassword" type="password" placeholder="Minimal 8 karakter">
        </div>
        <div style="display:grid;gap:8px;">
          <label>Konfirmasi Password Baru</label>
          <input id="fResetPasswordConfirm" type="password" placeholder="Ulangi password baru">
        </div>
        <button type="button" class="btn primary" onclick="submitForgotPassword()">Ubah Password</button>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Batal</button>
    </div>
  `);

  const resetRole = $('#fResetRole');
  if (resetRole) {
    resetRole.onchange = () => {
      const isDosen = resetRole.value === 'dosen';
      const label = $('#fResetIdentifierLabel');
      const input = $('#fResetIdentifier');
      if (label) label.textContent = isDosen ? 'NIP' : 'NIM';
      if (input) input.placeholder = isDosen ? 'Masukkan NIP' : 'Masukkan NIM';
      currentLoginRole = isDosen ? 'dosen' : 'mahasiswa';
    };
  }

  toggleForgotPasswordStep(1);
  const resendBtn = $('#forgotPasswordResendBtn');
  if (resendBtn) {
    resendBtn.disabled = false;
    resendBtn.textContent = 'Kirim ulang kode';
  }
}

function getForgotPasswordRole() {
  const resetRole = $('#fResetRole');
  if (resetRole) {
    currentLoginRole = resetRole.value === 'dosen' ? 'dosen' : 'mahasiswa';
    return currentLoginRole;
  }

  return currentLoginRole === 'dosen' ? 'dosen' : 'mahasiswa';
}

async function sendForgotPasswordCode() {
  const isDosen = getForgotPasswordRole() === 'dosen';
  const identifier = $('#fResetIdentifier').value.trim();
  const email = $('#fResetEmail').value.trim().toLowerCase();

  if (!identifier || !email) return toast('NIM/NIP dan email wajib diisi');

  const request = isDosen ? { nip: identifier, email, role: 'dosen' } : { nim: identifier, email, role: 'mahasiswa' };

  try {
    const response = await apiRequest('/forgot-password/request', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    toggleForgotPasswordStep(2);
    $('#fResetCode').focus();
    startForgotPasswordCountdown(60);
    toast(response.message || 'Kode verifikasi dikirim');
  } catch (err) {
    toast(err.message || 'Gagal mengirim kode verifikasi');
  }
}

async function verifyForgotPasswordCode() {
  const isDosen = getForgotPasswordRole() === 'dosen';
  const identifier = $('#fResetIdentifier').value.trim();
  const email = $('#fResetEmail').value.trim().toLowerCase();
  const code = $('#fResetCode').value.trim();

  if (!identifier || !email || !code) return toast('Silakan isi NIM/NIP, email, dan kode verifikasi');

  try {
    const response = await apiRequest('/forgot-password/verify', {
      method: 'POST',
      body: JSON.stringify(isDosen ? { nip: identifier, email, code, role: 'dosen' } : { nim: identifier, email, code, role: 'mahasiswa' }),
    });

    toggleForgotPasswordStep(3);
    $('#fResetPassword').focus();
    toast(response.message || 'Kode verifikasi valid');
  } catch (err) {
    toast(err.message || 'Kode verifikasi gagal diproses');
  }
}

function submitForgotPassword() {
  const isDosen = getForgotPasswordRole() === 'dosen';
  const identifier = $('#fResetIdentifier').value.trim();
  const email = $('#fResetEmail').value.trim().toLowerCase();
  const code = $('#fResetCode').value.trim();
  const newPassword = $('#fResetPassword').value;
  const confirmPassword = $('#fResetPasswordConfirm').value;

  if (!identifier || !email || !code || !newPassword || !confirmPassword) return toast('Semua field wajib diisi');
  if (newPassword.length < 8) return toast('Password baru minimal 8 karakter');
  if (newPassword !== confirmPassword) return toast('Konfirmasi password tidak cocok');

  const request = isDosen ? { nip: identifier, email, newPassword, role: 'dosen' } : { nim: identifier, email, newPassword, role: 'mahasiswa' };

  if (window.isBackendReady) {
    apiRequest('/forgot-password', {
      method: 'POST',
      body: JSON.stringify(request),
    }).then(() => {
      closeModal();
      $('#loginForm').reset();
      setAuthMode('login');
      toast('Password berhasil direset. Silakan login kembali.');
    }).catch((err) => toast(err.message || 'Gagal reset password'));
    return;
  }

  return toast('Mode lokal belum mendukung verifikasi reset password via email');
}

function openChangePasswordModal() {
  openModal(`
    <div class="modal-head">
      <h3>Ubah Password</h3>
      <button class="close" onclick="closeModal()">✕</button>
    </div>
    <div style="display:grid;gap:12px;">
      <label>Password Lama</label>
      <input id="fCurrentPassword" type="password" placeholder="Masukkan password lama">
      <label>Password Baru</label>
      <input id="fNewPassword" type="password" placeholder="Minimal 8 karakter">
      <label>Konfirmasi Password Baru</label>
      <input id="fNewPasswordConfirm" type="password" placeholder="Ulangi password baru">
    </div>
    <div class="modal-actions">
      <button class="btn ghost" onclick="closeModal()">Batal</button>
      <button class="btn primary" onclick="submitChangePassword()">Simpan</button>
    </div>
  `);
}

function submitChangePassword() {
  const currentPassword = $('#fCurrentPassword').value;
  const newPassword = $('#fNewPassword').value;
  const confirmPassword = $('#fNewPasswordConfirm').value;

  if (user.role === 'dosen') {
    const nip = user.nip || $('#dosenLoginNip').value.trim();
    if (!nip || !currentPassword || !newPassword || !confirmPassword) return toast('Semua field wajib diisi');
    if (newPassword.length < 8) return toast('Password baru minimal 8 karakter');
    if (newPassword !== confirmPassword) return toast('Konfirmasi password tidak cocok');

    if (window.isBackendReady) {
      apiRequest('/change-password', {
        method: 'POST',
        body: JSON.stringify({ nip, currentPassword, newPassword, role: 'dosen' }),
      }).then(() => {
        closeModal();
        toast('Password berhasil diubah');
      }).catch((err) => toast(err.message || 'Gagal mengganti password'));
      return;
    }

    return toast('Mode lokal belum mendukung ganti password dosen');
  }

  const nim = user.nim || $('#loginName').value.trim();

  if (!nim || !currentPassword || !newPassword || !confirmPassword) return toast('Semua field wajib diisi');
  if (newPassword.length < 8) return toast('Password baru minimal 8 karakter');
  if (newPassword !== confirmPassword) return toast('Konfirmasi password tidak cocok');

  if (window.isBackendReady) {
    apiRequest('/change-password', {
      method: 'POST',
      body: JSON.stringify({ nim, currentPassword, newPassword, role: 'mahasiswa' }),
    }).then(() => {
      closeModal();
      toast('Password berhasil diubah');
    }).catch((err) => toast(err.message || 'Gagal mengganti password'));
    return;
  }

  const account = accounts.find((a) => a.nim === nim);
  if (!account) return toast('User tidak ditemukan');
  if (account.password !== currentPassword) return toast('Password lama tidak sesuai');
  account.password = newPassword;
  saveAccounts();
  closeModal();
  toast('Password berhasil diubah');
}

$('#authSwitch button').onclick = () => setAuthMode('login');
if ($('#forgotPasswordBtn')) $('#forgotPasswordBtn').onclick = openForgotPasswordModal;
if ($('#changePasswordBtn')) $('#changePasswordBtn').onclick = openChangePasswordModal;

$('#registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#registerName').value.trim();
  const nim = $('#registerNIM').value.trim();
  const email = $('#registerEmail').value.trim().toLowerCase();
  const password = $('#registerPassword').value;
  const passwordConfirm = $('#registerPasswordConfirm').value;
  const ownerCode = ($('#registerOwnerCode') && $('#registerOwnerCode').value.trim()) || '';

  if (password.length < 8) return toast('Password minimal 8 karakter');
  if (password !== passwordConfirm) return toast('Konfirmasi password tidak cocok');
  if (await waitForBackend()) {
    try {
      await apiRequest('/register', { method: 'POST', body: JSON.stringify({ nama: name, nim, email, password, ownerToken: ownerCode }) });
      toast(ownerCode ? 'Pendaftaran terkirim. Kode pemilik diterima (jika valid), akun akan aktif.' : 'Pendaftaran terkirim. Menunggu verifikasi pemilik/dosen.');
    } catch (err) {
      return toast(err.message || 'Gagal mendaftar ke server');
    }
  } else {
    return toast('Server database belum tersedia. Pendaftaran belum disimpan.');
  }

  $('#registerForm').reset();
  setAuthMode('login');
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const identifier = $('#loginName').value.trim();
  const password = $('#loginPassword').value;

  if (await waitForBackend()) {
    try {
      const payload = await apiRequest('/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
      sessionStorage.setItem('ruangKelasAuthToken', payload.token);

      user.name = payload.nama;
      user.role = payload.role === 'dosen' ? 'dosen' : 'mahasiswa';
      user.id = payload.id;
      user.nim = payload.nim || '';
      user.nip = payload.nip || '';

      $('#profileName').textContent = user.name;
      $('#profileRole').textContent = user.role === 'dosen' ? 'Dosen' : 'Mahasiswa';
      $('#avatar').textContent = user.name.charAt(0).toUpperCase();
      $('#loginPage').classList.add('hidden');
      $('#app').classList.remove('hidden');
      $('#currentDate').textContent = today();
      await loadServerData().catch((error) => {
        toast(error.message || 'Gagal memuat data dari server');
      });
      render('dashboard');
    } catch (err) {
      toast(err.message || 'Gagal login');
    }
    return;
  }

  const account = accounts.find((a) => a.nim === identifier && a.password === password);
  if (!account) {
    const dosenAccount = accounts.find((a) => a.nip === identifier && a.password === password);
    if (!dosenAccount) return toast('NIM/NIP atau password salah (lokal)');
    user.name = dosenAccount.name;
    user.role = 'dosen';
    user.nip = identifier;
    $('#profileName').textContent = user.name;
    $('#profileRole').textContent = 'Dosen';
  } else {
    if (account.pending) return toast('Akun lokal belum diverifikasi oleh pemilik');
    user.name = account.name;
    user.role = 'mahasiswa';
    user.nim = identifier;
    $('#profileName').textContent = user.name;
    $('#profileRole').textContent = 'Mahasiswa';
  }

  $('#avatar').textContent = user.name.charAt(0).toUpperCase();
  $('#loginPage').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#currentDate').textContent = today();
  render('dashboard');
});

$('#logoutBtn').onclick = async () => {
  if (window.isBackendReady && sessionStorage.getItem('ruangKelasAuthToken')) {
    try {
      await apiRequest('/logout', { method: 'POST' });
    } catch (error) {
      toast(error.message || 'Sesi server gagal ditutup');
    }
  }

  user = { name: '', role: 'mahasiswa', nim: '', nip: '' };
  sessionStorage.removeItem('ruangKelasAuthToken');
  $('#app').classList.add('hidden');
  $('#loginPage').classList.remove('hidden');
  $('#loginForm').reset();
  setAuthMode('login');
};

setAuthMode('login');

$('#mobileMenu').onclick = () => $('.sidebar').classList.toggle('open');
$('#notifBtn').onclick = () => toast(`${db.announcements.length} pengumuman tersedia`);

// Cek koneksi server dengan beberapa percobaan, karena function bisa lambat saat pertama kali dipanggil
// atau jaringan perangkat sedang tidak stabil. Login dan pendaftaran menunggu hasil cek ini.
window.isBackendReady = false;
let backendCheck = null;

async function checkBackend(attempts = 3) {
  let lastMessage = 'Server tidak tersedia. Periksa koneksi internet lalu muat ulang halaman.';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (payload && payload.status === 'ok') return true;
      lastMessage = payload?.message || lastMessage;
    } catch {
      // Coba lagi setelah jeda singkat.
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  toast(lastMessage);
  return false;
}

function waitForBackend() {
  if (window.isBackendReady) return Promise.resolve(true);
  if (!backendCheck) {
    backendCheck = checkBackend().then((ready) => {
      window.isBackendReady = ready;
      backendCheck = null;
      return ready;
    });
  }
  return backendCheck;
}

waitForBackend();
