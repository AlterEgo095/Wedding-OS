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
  
  // Fix couple story image URLs in VPS database
  console.log('🔧 Fixing CoupleStory image URLs...');
  const fixResult = await runCmd(`docker exec wedding-app sh -c "node -e \\"const { PrismaClient } = require('@prisma/client'); const db = new PrismaClient(); (async () => { const stories = await db.coupleStory.findMany(); for (const s of stories) { if (s.imageUrl && s.imageUrl.includes('/upload/')) { const fixed = s.imageUrl.replace('/upload/', '/uploads/').replace('.png', '.jpeg'); await db.coupleStory.update({ where: { id: s.id }, data: { imageUrl: fixed } }); console.log('Fixed:', s.imageUrl, '->', fixed); } } await db.\\\\\$disconnect(); })()\\" 2>&1"`);
  console.log(`CoupleStory fix: ${fixResult.substring(0, 300)}`);
  
  // Fix settings image URLs
  console.log('\n🔧 Fixing Settings image URLs...');
  const fixSettings = await runCmd(`docker exec wedding-app sh -c "node -e \\"const { PrismaClient } = require('@prisma/client'); const db = new PrismaClient(); (async () => { const keys = ['couple_photo_1', 'couple_photo_2']; for (const key of keys) { const setting = await db.settings.findUnique({ where: { key } }); if (setting && setting.value && setting.value.includes('/upload/')) { const fixed = setting.value.replace('/upload/', '/uploads/').replace('.png', '.jpeg'); await db.settings.update({ where: { key }, data: { value: fixed } }); console.log('Fixed', key, ':', setting.value, '->', fixed); } } await db.\\\\\$disconnect(); })()\\" 2>&1"`);
  console.log(`Settings fix: ${fixSettings.substring(0, 300)}`);
  
  // Verify APIs
  console.log('\n🧪 Verifying APIs...');
  const coupleStory = await runCmd('curl -s http://127.0.0.1:3080/api/couple-story | head -c 400');
  console.log(`Couple Story: ${coupleStory}`);
  
  const settings = await runCmd('curl -s http://127.0.0.1:3080/api/settings | head -c 400');
  console.log(`Settings: ${settings}`);
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
