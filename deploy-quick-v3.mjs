import { Client } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';
const PROJECT_DIR = '/home/z/my-project';

const conn = new Client();

function runCmd(cmd) {
  return new Promise((resolve) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { resolve(`ERROR: ${err.message}`); return; }
      let out = '';
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => { out += d.toString(); });
      stream.on('close', () => { resolve(out.trim()); });
    });
  });
}

function upload(localPath, remotePath) {
  return new Promise((resolve) => {
    if (!existsSync(localPath)) { resolve('SKIP'); return; }
    const content = readFileSync(localPath);
    conn.sftp((err, sftp) => {
      if (err) { resolve(`SFTP_ERR: ${err.message}`); return; }
      const ws = sftp.createWriteStream(remotePath);
      ws.on('close', () => { resolve('OK'); });
      ws.on('error', (e) => { resolve(`ERR: ${e.message}`); });
      ws.end(content);
    });
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

conn.on('ready', async () => {
  console.log('✅ Connected!');
  
  // First check what exists on VPS
  console.log('\n🔍 Checking VPS state...');
  const checkResult = await runCmd(`ls ${DEPLOY_DIR}/src/components/effects/ 2>&1 || echo "NO_EFFECTS_DIR"`);
  console.log(`Effects dir: ${checkResult}`);
  
  const checkStore = await runCmd(`ls ${DEPLOY_DIR}/src/lib/visual-effects-store.ts 2>&1 || echo "NO_STORE"`);
  console.log(`Effects store: ${checkStore}`);
  
  const checkAppear = await runCmd(`ls ${DEPLOY_DIR}/src/components/admin/AppearanceManager.tsx 2>&1 || echo "NO_APPEAR"`);
  console.log(`Appearance mgr: ${checkAppear}`);
  
  const checkAdmin = await runCmd(`head -5 ${DEPLOY_DIR}/src/app/admin/page.tsx 2>&1 || echo "NO_ADMIN"`);
  console.log(`Admin page: ${checkAdmin.substring(0, 100)}`);
  
  // Create dirs
  console.log('\n📁 Creating dirs...');
  await runCmd(`mkdir -p ${DEPLOY_DIR}/src/components/effects ${DEPLOY_DIR}/src/lib ${DEPLOY_DIR}/src/components/admin ${DEPLOY_DIR}/src/app/admin`);
  
  // Upload most critical files - the effects system
  const files = [
    // Effects system (probably missing on VPS)
    ['src/lib/visual-effects-store.ts', 'src/lib/visual-effects-store.ts'],
    ['src/components/effects/VisualEffectsLayer.tsx', 'src/components/effects/VisualEffectsLayer.tsx'],
    ['src/components/effects/SparkleEffect.tsx', 'src/components/effects/SparkleEffect.tsx'],
    ['src/components/effects/FloatingParticles.tsx', 'src/components/effects/FloatingParticles.tsx'],
    ['src/components/effects/BokehEffect.tsx', 'src/components/effects/BokehEffect.tsx'],
    ['src/components/effects/DynamicLightSweep.tsx', 'src/components/effects/DynamicLightSweep.tsx'],
    ['src/components/effects/ScrollReveal.tsx', 'src/components/effects/ScrollReveal.tsx'],
    ['src/components/effects/SectionEffects.tsx', 'src/components/effects/SectionEffects.tsx'],
    // Admin appearance
    ['src/components/admin/AppearanceManager.tsx', 'src/components/admin/AppearanceManager.tsx'],
    // Admin panel with appearance tab
    ['src/components/admin/AdminPanel.tsx', 'src/components/admin/AdminPanel.tsx'],
    ['src/components/admin/MusicManager.tsx', 'src/components/admin/MusicManager.tsx'],
    // Main page with effects
    ['src/app/page.tsx', 'src/app/page.tsx'],
    // Hero with all effects
    ['src/components/HeroSection.tsx', 'src/components/HeroSection.tsx'],
    // Updated components
    ['src/components/OurStory.tsx', 'src/components/OurStory.tsx'],
    ['src/components/PremiumGallery.tsx', 'src/components/PremiumGallery.tsx'],
    ['src/components/EventTimeline.tsx', 'src/components/EventTimeline.tsx'],
    ['src/components/AmbientMusicPlayer.tsx', 'src/components/AmbientMusicPlayer.tsx'],
    ['src/components/Navigation.tsx', 'src/components/Navigation.tsx'],
    ['src/components/Footer.tsx', 'src/components/Footer.tsx'],
    ['src/components/GuestAuthForm.tsx', 'src/components/GuestAuthForm.tsx'],
    ['src/components/MapSection.tsx', 'src/components/MapSection.tsx'],
    ['src/components/GuestPersonalSpace.tsx', 'src/components/GuestPersonalSpace.tsx'],
    ['src/components/InvitationCard.tsx', 'src/components/InvitationCard.tsx'],
    ['src/components/AENEWSBanner.tsx', 'src/components/AENEWSBanner.tsx'],
    // Admin page
    ['src/app/admin/page.tsx', 'src/app/admin/page.tsx'],
    // Global CSS
    ['src/app/globals.css', 'src/app/globals.css'],
    ['src/app/layout.tsx', 'src/app/layout.tsx'],
    // Package.json for deps
    ['package.json', 'package.json'],
  ];
  
  console.log(`\n📤 Uploading ${files.length} critical files...`);
  let ok = 0, fail = 0;
  
  for (const [local, remote] of files) {
    const result = await upload(join(PROJECT_DIR, local), `${DEPLOY_DIR}/${remote}`);
    if (result === 'OK') { ok++; process.stdout.write('.'); }
    else { fail++; process.stdout.write('x'); }
    await sleep(200);
  }
  
  console.log(`\n✅ Uploaded: ${ok}, Failed: ${fail}`);
  
  // Rebuild Docker
  console.log('\n🔨 Rebuilding Docker (this will take 2-3 minutes)...');
  const buildResult = await runCmd(`cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 | tail -5`);
  console.log(`Build: ${buildResult}`);
  
  console.log('\n🚀 Restarting container...');
  const restartResult = await runCmd(`cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml up -d 2>&1`);
  console.log(`Restart: ${restartResult}`);
  
  console.log('\n⏳ Waiting 20s for container...');
  await sleep(20000);
  
  console.log('\n🧪 Testing...');
  const statusResult = await runCmd(`docker ps --filter name=wedding-app --format "{{.Names}} {{.Status}}"`);
  console.log(`Container: ${statusResult}`);
  
  const testResult = await runCmd(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/`);
  console.log(`HTTP Status: ${testResult}`);
  
  const settingsResult = await runCmd(`curl -s http://127.0.0.1:3080/api/settings | head -c 200`);
  console.log(`Settings API: ${settingsResult.substring(0, 150)}`);
  
  console.log('\n✅ Done!');
  conn.end();
});

conn.on('error', (err) => {
  console.error('❌ SSH error:', err.message);
});

console.log('Connecting...');
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
