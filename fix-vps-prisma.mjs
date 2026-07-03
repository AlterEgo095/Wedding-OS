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
  
  // Fix using Prisma client inside the container
  console.log('🔧 Fixing settings via Prisma...');
  const fix = await runCmd(`docker exec wedding-app node -e "
const { PrismaClient } = require('./node_modules/.prisma/client');
const prisma = new PrismaClient();
async function fix() {
  const s1 = await prisma.settings.findUnique({ where: { key: 'couple_photo_1' } });
  if (s1 && s1.value.includes('/upload/')) {
    await prisma.settings.update({ where: { key: 'couple_photo_1' }, data: { value: '/uploads/couple-photo-1.jpeg' } });
    console.log('Fixed couple_photo_1');
  }
  const s2 = await prisma.settings.findUnique({ where: { key: 'couple_photo_2' } });
  if (s2 && s2.value.includes('/upload/')) {
    await prisma.settings.update({ where: { key: 'couple_photo_2' }, data: { value: '/uploads/couple-photo-2.jpeg' } });
    console.log('Fixed couple_photo_2');
  }
  await prisma.\\\$disconnect();
}
fix().catch(e => console.error(e));
" 2>&1`);
  console.log(`Fix result: ${fix.substring(0, 300)}`);
  
  // Verify
  console.log('\n🧪 Verifying...');
  const settings = await runCmd('curl -s http://127.0.0.1:3080/api/settings 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(\'photo1:\', d[\'settings\'].get(\'couple_photo_1\',\'N/A\')); print(\'photo2:\', d[\'settings\'].get(\'couple_photo_2\',\'N/A\'))" 2>&1');
  console.log(`Settings: ${settings}`);
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
