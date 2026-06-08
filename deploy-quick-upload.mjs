import { Client } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';
const PROJECT_DIR = '/home/z/my-project';

const conn = new Client();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function runCmd(cmd) {
  return new Promise((resolve) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { resolve(`ERR:${err.message}`); return; }
      let out = '';
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => { out += d.toString(); });
      stream.on('close', () => resolve(out.trim()));
    });
  });
}

function upload(local, remote) {
  return new Promise((resolve) => {
    if (!existsSync(local)) { resolve(false); return; }
    conn.sftp((err, sftp) => {
      if (err) { resolve(false); return; }
      const ws = sftp.createWriteStream(remote);
      ws.on('close', () => resolve(true));
      ws.on('error', () => resolve(false));
      ws.end(readFileSync(local));
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected!');
  
  // Step 1: Check what's on VPS
  const effectsDir = await runCmd(`ls ${DEPLOY_DIR}/src/components/effects/ 2>&1`);
  console.log(`Effects: ${effectsDir.substring(0, 200)}`);
  
  // Step 2: Create dirs
  await runCmd(`mkdir -p ${DEPLOY_DIR}/src/components/effects ${DEPLOY_DIR}/src/lib`);
  
  // Step 3: Upload ONLY the most critical missing files
  const files = [
    'src/lib/visual-effects-store.ts',
    'src/components/effects/VisualEffectsLayer.tsx',
    'src/components/effects/SparkleEffect.tsx',
    'src/components/effects/FloatingParticles.tsx',
    'src/components/effects/BokehEffect.tsx',
    'src/components/effects/DynamicLightSweep.tsx',
    'src/components/effects/ScrollReveal.tsx',
    'src/components/effects/SectionEffects.tsx',
    'src/components/admin/AppearanceManager.tsx',
    'src/components/admin/AdminPanel.tsx',
    'src/components/admin/MusicManager.tsx',
    'src/app/page.tsx',
    'src/components/HeroSection.tsx',
    'src/components/AmbientMusicPlayer.tsx',
    'src/app/globals.css',
  ];
  
  let ok = 0;
  for (const f of files) {
    const r = await upload(join(PROJECT_DIR, f), `${DEPLOY_DIR}/${f}`);
    if (r) ok++;
    process.stdout.write(r ? '.' : 'x');
    await sleep(300);
  }
  console.log(`\n${ok}/${files.length} uploaded`);
  
  // Step 4: Start rebuild in background
  console.log('Starting rebuild in background...');
  await runCmd(`nohup bash -c 'cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 && docker compose -f docker-compose.prod.yml up -d 2>&1' > /tmp/rebuild.log 2>&1 &`);
  console.log('Rebuild started. Check: tail -f /tmp/rebuild.log on VPS');
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
