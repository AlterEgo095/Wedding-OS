import { Client } from 'ssh2';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

const conn = new Client();

function runCmd(cmd, timeout = 30000) {
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
  
  // Check build status
  const status = await runCmd('cat /tmp/deploy-status.txt 2>&1 || echo "BUILDING"');
  console.log(`Deploy status: ${status.substring(0, 200)}`);
  
  // Check if build is still running
  const ps = await runCmd('ps aux | grep "docker compose" | grep -v grep | head -2');
  console.log(`Build process: ${ps ? 'Running' : 'Not running'}`);
  
  // Check last few lines of build log
  const log = await runCmd('tail -10 /tmp/deploy-build.log 2>&1');
  console.log(`Build log (last 10):\n${log.substring(0, 500)}`);
  
  // If build is done, fix the database
  if (status.includes('SUCCESS')) {
    console.log('\n✅ Build successful! Fixing database...');
    
    // Wait for container to be ready
    const containerStatus = await runCmd('docker ps --filter name=wedding-app --format "{{.Status}}"');
    console.log(`Container: ${containerStatus}`);
    
    // Fix image URLs in the database
    console.log('\n🔧 Fixing image URLs in database...');
    const fixResult = await runCmd(`docker exec wedding-app sh -c "cd /app && node -e \\"const { PrismaClient } = require('@prisma/client'); const db = new PrismaClient(); (async () => { const stories = await db.coupleStory.findMany(); for (const s of stories) { if (s.imageUrl && s.imageUrl.includes('/upload/')) { const fixed = s.imageUrl.replace('/upload/', '/uploads/').replace('.png', '.jpeg'); await db.coupleStory.update({ where: { id: s.id }, data: { imageUrl: fixed } }); console.log('Fixed:', s.imageUrl, '->', fixed); } } await db.\\$disconnect(); })()\\" 2>&1"`);
    console.log(`DB Fix: ${fixResult.substring(0, 300)}`);
    
    // Test the site
    console.log('\n🧪 Testing site...');
    const httpCode = await runCmd('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/');
    console.log(`HTTP: ${httpCode}`);
    
    const settingsApi = await runCmd('curl -s http://127.0.0.1:3080/api/settings | head -c 200');
    console.log(`Settings API: ${settingsApi}`);
    
    const coupleStory = await runCmd('curl -s http://127.0.0.1:3080/api/couple-story | head -c 300');
    console.log(`Couple Story API: ${coupleStory}`);
  } else {
    console.log('\n⏳ Build still in progress. Will need to check again later.');
  }
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
