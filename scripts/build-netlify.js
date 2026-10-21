const fs = require('node:fs');
const path = require('node:path');

const apiBaseUrl = process.env.API_BASE_URL;
if (!apiBaseUrl) {
  throw new Error('Atur API_BASE_URL ke URL backend Railway, termasuk akhiran /api.');
}

let parsedApiUrl;
try {
  parsedApiUrl = new URL(apiBaseUrl);
} catch {
  throw new Error('API_BASE_URL harus berupa URL backend yang valid.');
}

if (parsedApiUrl.protocol !== 'https:' || parsedApiUrl.pathname.replace(/\/+$/, '') !== '/api'
  || parsedApiUrl.search || parsedApiUrl.hash || parsedApiUrl.username || parsedApiUrl.password) {
  throw new Error('API_BASE_URL harus memakai HTTPS dan berformat https://domain-backend/api.');
}

const projectDirectory = path.resolve(__dirname, '..');
const outputDirectory = path.join(projectDirectory, 'dist');
fs.mkdirSync(outputDirectory, { recursive: true });
fs.copyFileSync(path.join(projectDirectory, 'index.html'), path.join(outputDirectory, 'index.html'));
fs.cpSync(path.join(projectDirectory, 'css'), path.join(outputDirectory, 'css'), { recursive: true });
fs.cpSync(path.join(projectDirectory, 'js'), path.join(outputDirectory, 'js'), { recursive: true });
fs.writeFileSync(
  path.join(outputDirectory, 'netlify-runtime-config.js'),
  `window.RUANGKELAS_API_BASE = ${JSON.stringify(apiBaseUrl.replace(/\/+$/, ''))};\n`
);

console.log(`Netlify build selesai; API diarahkan ke ${parsedApiUrl.origin}/api`);
