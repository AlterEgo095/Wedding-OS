import { Client } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';
const PROJECT_DIR = '/home/z/my-project';

const conn = new Client();

function runCommand(cmd, timeout = 60000) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', (data) => { stdout += data.toString(); });
      stream.stderr.on('data', (data) => { stderr += data.toString(); });
      stream.on('close', (code) => {
        resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
      });
    });
  });
}

function uploadFile(localPath, remotePath) {
  return new Promise((resolve, reject) => {
    if (!existsSync(localPath)) return resolve(false);
    const content = readFileSync(localPath);
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const stream = sftp.createWriteStream(remotePath);
      stream.on('close', () => { resolve(true); });
      stream.on('error', (e) => { resolve(false); });
      stream.end(content);
    });
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const criticalFiles = [
  'src/lib/visual-effects-store.ts',
  'src/components/effects/VisualEffectsLayer.tsx',
  'src/components/effects/SparkleEffect.tsx',
  'src/components/effects/FloatingParticles.tsx',
  'src/components/effects/BokehEffect.tsx',
  'src/components/effects/DynamicLightSweep.tsx',
  'src/components/effects/ScrollReveal.tsx',
  'src/components/effects/SectionEffects.tsx',
  'src/app/page.tsx',
  'src/app/layout.tsx',
  'src/app/globals.css',
  'src/components/HeroSection.tsx',
  'src/components/OurStory.tsx',
  'src/components/PremiumGallery.tsx',
  'src/components/EventTimeline.tsx',
  'src/components/Navigation.tsx',
  'src/components/Footer.tsx',
  'src/components/AmbientMusicPlayer.tsx',
  'src/components/GuestAuthForm.tsx',
  'src/components/GuestPersonalSpace.tsx',
  'src/components/MapSection.tsx',
  'src/components/InvitationCard.tsx',
  'src/components/AENEWSBanner.tsx',
  'src/components/CouplePhotosSection.tsx',
  'src/components/MarketingSection.tsx',
  'src/components/PWAInstall.tsx',
  'src/components/GuestAuthProvider.tsx',
  'src/components/GuestSearch.tsx',
  'src/components/CoupleGallery.tsx',
  'src/components/admin/AdminPanel.tsx',
  'src/components/admin/Dashboard.tsx',
  'src/components/admin/AppearanceManager.tsx',
  'src/components/admin/MusicManager.tsx',
  'src/components/admin/GuestManager.tsx',
  'src/components/admin/TableManager.tsx',
  'src/components/admin/MediaManager.tsx',
  'src/components/admin/UserManager.tsx',
  'src/components/admin/TimelineManager.tsx',
  'src/components/admin/SettingsManager.tsx',
  'src/components/admin/AccessLogManager.tsx',
  'src/components/admin/LoginForm.tsx',
  'src/app/admin/page.tsx',
  'src/app/api/music/route.ts',
  'src/app/api/music/file/route.ts',
  'src/app/api/settings/route.ts',
  'src/app/api/couple-story/route.ts',
  'src/app/api/timeline/route.ts',
  'src/app/api/guests/route.ts',
  'src/app/api/guests/search/route.ts',
  'src/app/api/guests/import/route.ts',
  'src/app/api/guests/import-docx/route.ts',
  'src/app/api/guests/export/route.ts',
  'src/app/api/guests/qrcode/[code]/route.ts',
  'src/app/api/guest/lookup/route.ts',
  'src/app/api/guest/auth/route.ts',
  'src/app/api/guest/auto-auth/route.ts',
  'src/app/api/guest/me/route.ts',
  'src/app/api/guest/rsvp/route.ts',
  'src/app/api/guest/access-logs/route.ts',
  'src/app/api/guest/logout/route.ts',
  'src/app/api/guest/invite/route.ts',
  'src/app/api/tables/route.ts',
  'src/app/api/admin/login/route.ts',
  'src/app/api/admin/dashboard/route.ts',
  'src/app/api/admin/users/route.ts',
  'src/app/api/media/route.ts',
  'src/app/api/route.ts',
  'src/lib/auth.ts',
  'src/lib/guest-auth.ts',
  'src/lib/db.ts',
  'src/lib/utils.ts',
  'src/lib/guest-utils.ts',
  'src/lib/rate-limit.ts',
  'src/hooks/use-mobile.ts',
  'src/hooks/use-toast.ts',
  'src/components/providers/theme-provider.tsx',
  'src/middleware.ts',
  'package.json',
  'next.config.ts',
  'tsconfig.json',
  'tailwind.config.ts',
  'postcss.config.mjs',
  'eslint.config.mjs',
  'components.json',
  'prisma/schema.prisma',
  'prisma/seed.ts',
  'docker-compose.prod.yml',
  'Dockerfile',
  'docker-entrypoint.sh',
];

conn.on('ready', async () => {
  console.log('✅ Connected to VPS!');
  
  try {
    // Create all directories first
    console.log('📁 Creating directories...');
    const dirs = new Set();
    for (const file of criticalFiles) {
      dirs.add(dirname(file));
    }
    const mkdirCmd = [...dirs].map(d => `mkdir -p ${DEPLOY_DIR}/${d}`).join(' && ');
    const r = await runCommand(mkdirCmd);
    console.log('✅ Directories created');
    
    // Upload files in batches of 5 with delays
    console.log(`📤 Uploading ${criticalFiles.length} files...`);
    let uploaded = 0;
    let failed = 0;
    
    for (let i = 0; i < criticalFiles.length; i += 5) {
      const batch = criticalFiles.slice(i, i + 5);
      for (const file of batch) {
        const localPath = join(PROJECT_DIR, file);
        const remotePath = `${DEPLOY_DIR}/${file}`;
        try {
          const ok = await uploadFile(localPath, remotePath);
          if (ok) uploaded++;
          else { failed++; }
        } catch (e) {
          failed++;
        }
      }
      console.log(`  → ${uploaded} uploaded, ${failed} failed (batch ${Math.floor(i/5)+1})`);
      await sleep(500); // Delay between batches
    }
    
    console.log(`\n✅ Files uploaded: ${uploaded}, Failed: ${failed}`);
    
    // Trigger Docker rebuild in background
    console.log('\n🔨 Triggering Docker rebuild (runs in background on VPS)...');
    await runCommand(`cd ${DEPLOY_DIR} && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app && docker compose -f docker-compose.prod.yml up -d' > /tmp/deploy-rebuild.log 2>&1 &`);
    console.log('✅ Rebuild started in background on VPS');
    console.log('  → Check progress: ssh aenews@95.111.226.63 "tail -f /tmp/deploy-rebuild.log"');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  conn.end();
});

conn.on('error', (err) => {
  console.error('❌ SSH error:', err.message);
});

console.log(`Connecting to ${VPS_USER}@${VPS_HOST}...`);
conn.connect({
  host: VPS_HOST,
  port: 22,
  username: VPS_USER,
  password: VPS_PASS,
  readyTimeout: 60000,
  keepaliveInterval: 10000,
});
