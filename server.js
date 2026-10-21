// Server lokal opsional. Disarankan menjalankan `netlify dev` agar Netlify Database dan Blobs tersedia secara lokal.
require('dotenv').config();
const path = require('path');
const express = require('express');
const app = require('./server/app');

const PORT = process.env.PORT || 3000;

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.get('/netlify-runtime-config.js', (req, res) => {
  res.type('application/javascript').send("window.RUANGKELAS_API_BASE = '/api';\n");
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server RuangKelas aktif di http://localhost:${PORT}`);
});
