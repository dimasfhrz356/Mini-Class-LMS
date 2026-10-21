require('dotenv').config();
const mysql = require('mysql2/promise');

(async function(){
  try{
    const target = process.argv[2];
    if(!target){
      console.log('Usage: node scripts/check_user.js <nim|id>');
      process.exit(1);
    }

    const c = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kampus_db'
    });

    let q, params;
    if(/^\d+$/.test(target)){
      q = 'SELECT id,nama,nim,email,approved,password FROM mahasiswa WHERE id=? LIMIT 1';
      params = [Number(target)];
    } else {
      q = 'SELECT id,nama,nim,email,approved,password FROM mahasiswa WHERE nim=? LIMIT 1';
      params = [target];
    }

    const [rows] = await c.execute(q, params);
    if(!rows.length){
      console.log('Akun tidak ditemukan:', target);
    } else {
      const r = rows[0];
      console.log('Found:');
      console.table([{
        id: r.id,
        nama: r.nama,
        nim: r.nim,
        email: r.email,
        approved: r.approved,
        password_preview: r.password ? (r.password.toString().slice(0,6) + '...') : null
      }]);
      console.log('Full password field:', r.password);
    }
    await c.end();
  } catch(err){
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
