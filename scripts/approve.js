require('dotenv').config();
const mysql = require('mysql2/promise');
const readline = require('readline');

async function confirm(question){
  const rl = readline.createInterface({input: process.stdin, output: process.stdout});
  return new Promise(resolve=> rl.question(question, ans=>{rl.close(); resolve(ans.trim().toLowerCase());}));
}

(async function(){
  try{
    const target = process.argv[2];
    const autoYes = process.argv.includes('--yes') || process.argv.includes('-y');
    if(!target){
      console.log('Usage: node scripts/approve.js <id|nim> [--yes]');
      process.exit(1);
    }

    const c = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kampus_db'
    });

    let row;
    // If numeric, try id first, then fallback to nim. Otherwise query by nim.
    if(/^\d+$/.test(target)){
      let [r] = await c.execute('SELECT id,nama,nim,email,approved FROM mahasiswa WHERE id=?', [Number(target)]);
      row = r[0];
      if(!row){
        [r] = await c.execute('SELECT id,nama,nim,email,approved FROM mahasiswa WHERE nim=?', [target]);
        row = r[0];
      }
    } else {
      const [r] = await c.execute('SELECT id,nama,nim,email,approved FROM mahasiswa WHERE nim=?', [target]);
      row = r[0];
    }

    if(!row){
      console.log('Akun tidak ditemukan:', target);
      await c.end();
      process.exit(1);
    }

    console.table([row]);
    if(row.approved==1){
      console.log('Sudah disetujui.');
      await c.end();
      process.exit(0);
    }

    if(!autoYes){
      const ans = await confirm(`Setujui akun ${row.nama} (nim=${row.nim})? (y/N): `);
      if(ans !== 'y'){
        console.log('Batal.');
        await c.end();
        process.exit(0);
      }
    }

    const [res] = await c.execute('UPDATE mahasiswa SET approved=1 WHERE id=?', [row.id]);
    if(res.affectedRows>0) console.log('Berhasil menyetujui id=', row.id);
    else console.log('Gagal menyetujui.');
    await c.end();
  } catch(err){
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
