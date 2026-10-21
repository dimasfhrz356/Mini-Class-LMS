require('dotenv').config();
const mysql = require('mysql2/promise');

(async function(){
  try{
    const c = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kampus_db'
    });
    const [rows] = await c.execute('SELECT id,nama,nim,email,approved FROM mahasiswa WHERE approved=0');
    if(!rows.length){
      console.log('Tidak ada pendaftaran pending.');
    } else {
      console.table(rows);
    }
    await c.end();
  } catch(err){
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
