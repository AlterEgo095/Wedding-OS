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

function upload(local, remote) {
  return new Promise((resolve) => {
    if (!existsSync(local)) { resolve('MISSING'); return; }
    conn.sftp((err, sftp) => {
      if (err) { resolve(`SFTP_ERR:${err.message}`); return; }
      const ws = sftp.createWriteStream(remote);
      ws.on('close', () => resolve('OK'));
      ws.on('error', (e) => resolve(`ERR:${e.message}`));
      ws.end(readFileSync(local));
    });
  });
}

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

conn.on('ready', async () => {
  console.log('✅ Connected!');
  
  // Batch 1: Core files
  const batch1 = [
    'src/components/admin/AppearanceManager.tsx',
    'src/components/admin/AdminPanel.tsx',
    'src/components/admin/MusicManager.tsx',
    'src/app/page.tsx',
  ];
  
  console.log('Uploading batch 1...');
  for (const f of batch1) {
    const r = await upload(join(PROJECT_DIR, f), `${DEPLOY_DIR}/${f}`);
    console.log(`  ${f}: ${r}`);
    await sleep(500);
  }
  
  // Batch 2: Components
  const batch2 = [
    'src/components/HeroSection.tsx',
    'src/components/AmbientMusicPlayer.tsx',
    'src/app/globals.css',
    'src/components/OurStory.tsx',
  ];
  
  console.log('Uploading batch 2...');
  for (const f of batch2) {
    const r = await upload(join(PROJECT_DIR, f), `${DEPLOY_DIR}/${f}`);
    console.log(`  ${f}: ${r}`);
    await sleep(500);
  }
  
  // Batch 3: More components
  const batch3 = [
    'src/components/PremiumGallery.tsx',
    'src/components/EventTimeline.tsx',
    'src/components/Navigation.tsx',
    'src/components/Footer.tsx',
  ];
  
  console.log('Uploading batch 3...');
  for (const f of batch3) {
    const r = await upload(join(PROJECT_DIR, f), `${DEPLOY_DIR}/${f}`);
    console.log(`  ${f}: ${r}`);
    await sleep(500);
  }
  
  // Batch 4: Remaining files
  const batch4 = [
    'src/components/GuestAuthForm.tsx',
    'src/components/GuestPersonalSpace.tsx',
    'src/components/MapSection.tsx',
    'src/components/InvitationCard.tsx',
    'src/components/AENEWSBanner.tsx',
    'src/app/admin/page.tsx',
    'src/app/layout.tsx',
    'package.json',
    'src/components/effects/DynamicLightSweep.tsx',
    'src/components/effects/ScrollReveal.tsx',
    'src/components/effects/SectionEffects.tsx',
    'src/middleware.ts',
  ];
  
  console.log('Uploading batch 4...');
  for (const f of batch4) {
    const r = await upload(join(PROJECT_DIR, f), `${DEPLOY_DIR}/${f}`);
    console.log(`  ${f}: ${r}`);
    await sleep(500);
  }
  
  // Check rebuild status
  console.log('\nChecking rebuild status...');
  const rebuildStatus = await runCmd('tail -5 /tmp/rebuild.log 2>&1 || echo "NO_LOG"');
  console.log(`Rebuild log: ${rebuildStatus.substring(0, 200)}`);
  
  // If no rebuild is running, start one
  const psCheck = await runCmd('ps aux | grep "docker compose" | grep -v grep | head -3');
  console.log(`Docker processes: ${psCheck.substring(0, 200)}`);
  
  if (!psCheck || psCheck.includes('ERR')) {
    console.log('Starting rebuild...');
    await runCmd(`cd ${DEPLOY_DIR} && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app && docker compose -f docker-compose.prod.yml up -d' > /tmp/rebuild.log 2>&1 &`);
  }
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
