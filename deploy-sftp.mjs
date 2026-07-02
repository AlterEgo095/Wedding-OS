import { Client } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';
const PROJECT_DIR = '/home/z/my-project';

const conn = new Client();

function getSftp() {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) reject(err);
      else resolve(sftp);
    });
  });
}

function sftpUpload(sftp, local, remote) {
  return new Promise((resolve) => {
    if (!existsSync(local)) { resolve('MISSING'); return; }
    const ws = sftp.createWriteStream(remote);
    ws.on('close', () => resolve('OK'));
    ws.on('error', (e) => resolve(`ERR:${e.message}`));
    ws.end(readFileSync(local));
  });
}

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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ALL_FILES = [
  // Effects (already partially there but let's ensure all)
  'src/lib/visual-effects-store.ts',
  'src/components/effects/VisualEffectsLayer.tsx',
  'src/components/effects/SparkleEffect.tsx',
  'src/components/effects/FloatingParticles.tsx',
  'src/components/effects/BokehEffect.tsx',
  'src/components/effects/DynamicLightSweep.tsx',
  'src/components/effects/ScrollReveal.tsx',
  'src/components/effects/SectionEffects.tsx',
  // Core pages
  'src/app/page.tsx',
  'src/app/layout.tsx',
  'src/app/globals.css',
  'src/app/admin/page.tsx',
  'src/middleware.ts',
  // Components
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
  // Admin
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
  // Providers & Hooks
  'src/components/providers/theme-provider.tsx',
  'src/hooks/use-mobile.ts',
  'src/hooks/use-toast.ts',
  // Lib
  'src/lib/auth.ts',
  'src/lib/guest-auth.ts',
  'src/lib/db.ts',
  'src/lib/utils.ts',
  'src/lib/guest-utils.ts',
  'src/lib/rate-limit.ts',
  // API
  'src/app/api/music/route.ts',
  'src/app/api/music/file/route.ts',
  'src/app/api/settings/route.ts',
  'src/app/api/couple-story/route.ts',
  'src/app/api/timeline/route.ts',
  'src/app/api/route.ts',
  'src/app/api/media/route.ts',
  'src/app/api/tables/route.ts',
  'src/app/api/guest/lookup/route.ts',
  'src/app/api/guest/auth/route.ts',
  'src/app/api/guest/auto-auth/route.ts',
  'src/app/api/guest/me/route.ts',
  'src/app/api/guest/rsvp/route.ts',
  'src/app/api/guest/access-logs/route.ts',
  'src/app/api/guest/logout/route.ts',
  'src/app/api/guest/invite/route.ts',
  'src/app/api/guests/route.ts',
  'src/app/api/guests/search/route.ts',
  'src/app/api/guests/import/route.ts',
  'src/app/api/guests/import-docx/route.ts',
  'src/app/api/guests/export/route.ts',
  'src/app/api/admin/login/route.ts',
  'src/app/api/admin/dashboard/route.ts',
  'src/app/api/admin/users/route.ts',
  // Config
  'package.json',
  'next.config.ts',
  'tsconfig.json',
  'tailwind.config.ts',
  'postcss.config.mjs',
  'eslint.config.mjs',
  'components.json',
  'prisma/schema.prisma',
  'docker-compose.prod.yml',
  'Dockerfile',
  'docker-entrypoint.sh',
];

conn.on('ready', async () => {
  console.log('✅ Connected! Opening SFTP...');
  
  try {
    const sftp = await getSftp();
    console.log('✅ SFTP session open');
    
    // Create dirs first
    console.log('Creating directories...');
    const dirs = new Set();
    for (const f of ALL_FILES) {
      const dir = f.substring(0, f.lastIndexOf('/'));
      if (dir) dirs.add(dir);
    }
    // Create dirs via SFTP mkdir (ignore errors for existing)
    for (const dir of dirs) {
      try {
        await new Promise((resolve, reject) => {
          sftp.mkdir(`${DEPLOY_DIR}/${dir}`, (err) => {
            if (err && err.code !== 4) { /* ignore already exists */ }
            resolve();
          });
        });
        // Also create parent dirs
        const parts = dir.split('/');
        for (let i = 1; i <= parts.length; i++) {
          const subDir = parts.slice(0, i).join('/');
          try {
            await new Promise((resolve) => {
              sftp.mkdir(`${DEPLOY_DIR}/${subDir}`, () => resolve());
            });
          } catch (e) {}
        }
      } catch (e) {}
    }
    console.log('✅ Directories ready');
    
    // Upload all files using the same SFTP session
    console.log(`Uploading ${ALL_FILES.length} files...`);
    let ok = 0, fail = 0;
    
    for (let i = 0; i < ALL_FILES.length; i++) {
      const f = ALL_FILES[i];
      const localPath = join(PROJECT_DIR, f);
      const remotePath = `${DEPLOY_DIR}/${f}`;
      
      const result = await sftpUpload(sftp, localPath, remotePath);
      if (result === 'OK') {
        ok++;
      } else {
        fail++;
        if (fail <= 10) console.log(`  ❌ ${f}: ${result}`);
      }
      
      if ((i + 1) % 20 === 0) {
        console.log(`  Progress: ${i + 1}/${ALL_FILES.length} (ok:${ok} fail:${fail})`);
      }
    }
    
    console.log(`\n✅ Upload complete: ${ok} OK, ${fail} failed`);
    
    // Close SFTP
    sftp.end();
    
    // Start Docker rebuild in background
    console.log('\n🔨 Starting Docker rebuild in background...');
    await runCmd(`cd ${DEPLOY_DIR} && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 && docker compose -f docker-compose.prod.yml up -d 2>&1 && echo "REBUILD_COMPLETE" >> /tmp/rebuild.log' > /tmp/rebuild.log 2>&1 &`);
    console.log('Rebuild started in background on VPS');
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
console.log('Connecting...');
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
