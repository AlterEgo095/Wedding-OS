import { Client } from 'ssh2';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';

const conn = new Client();

function runCmd(cmd) {
  return new Promise((resolve) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { resolve(''); return; }
      let out = '';
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => { out += d.toString(); });
      stream.on('close', () => resolve(out.trim()));
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected!');
  
  // Fix settings using direct SQLite command inside container
  console.log('🔧 Fixing settings via SQLite...');
  const fixSettings = await runCmd(`docker exec wedding-app sh -c 'sqlite3 /app/db/custom.db "UPDATE Settings SET value = REPLACE(value, \\"/upload/\\", \\"/uploads/\\") WHERE key IN (\\"couple_photo_1\\", \\"couple_photo_2\\") AND value LIKE \\"%/upload/%\\";" 2>&1 || echo "SQLITE_NOT_AVAILABLE"'`);
  console.log(`SQLite fix: ${fixSettings}`);
  
  // Try with node instead
  if (fixSettings.includes('NOT_AVAILABLE')) {
    console.log('Trying with node...');
    const nodeFix = await runCmd(`docker exec wedding-app node -e "
const Database = require('better-sqlite3');
const db = new Database('/app/db/custom.db');
const result1 = db.prepare(\\"UPDATE Settings SET value = '/uploads/couple-photo-1.jpeg' WHERE key = 'couple_photo_1'\\").run();
const result2 = db.prepare(\\"UPDATE Settings SET value = '/uploads/couple-photo-2.jpeg' WHERE key = 'couple_photo_2'\\").run();
console.log('Updated:', result1.changes, result2.changes);
db.close();
" 2>&1`);
    console.log(`Node fix: ${nodeFix}`);
  }
  
  // Verify
  console.log('\n🧪 Verifying...');
  const settings = await runCmd('curl -s http://127.0.0.1:3080/api/settings | python3 -c "import sys,json; d=json.load(sys.stdin); print(\'photo1:\', d[\'settings\'].get(\'couple_photo_1\',\'N/A\')); print(\'photo2:\', d[\'settings\'].get(\'couple_photo_2\',\'N/A\'))" 2>&1 || curl -s http://127.0.0.1:3080/api/settings | head -c 400');
  console.log(`Settings: ${settings}`);
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
