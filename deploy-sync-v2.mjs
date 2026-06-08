import { Client } from 'ssh2';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';
const PROJECT_DIR = '/home/z/my-project';

const conn = new Client();

function runCommand(cmd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    console.log(`  → ${cmd.substring(0, 120)}${cmd.length > 120 ? '...' : ''}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', (data) => { stdout += data.toString(); });
      stream.stderr.on('data', (data) => { stderr += data.toString(); });
      stream.on('close', (code) => {
        if (stdout.trim()) console.log(`  ✓ ${stdout.trim().substring(0, 300)}`);
        if (stderr.trim() && !stderr.includes('WARNING') && !stderr.includes('npm warn')) {
          console.log(`  ⚠ ${stderr.trim().substring(0, 300)}`);
        }
        resolve({ code, stdout, stderr });
      });
    });
  });
}

function uploadFile(localPath, remotePath) {
  return new Promise((resolve, reject) => {
    const content = readFileSync(localPath);
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const stream = sftp.createWriteStream(remotePath);
      stream.on('close', () => { resolve(); });
      stream.on('error', (e) => { reject(e); });
      stream.end(content);
    });
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

conn.on('ready', async () => {
  console.log('✅ Connected to VPS!');
  
  try {
    // Step 1: Use rsync approach - upload a tar archive of src/ directory
    console.log('\n📦 Step 1: Creating local archive of source files...');
    
    // First, let's just upload key source files one by one with delays
    const criticalFiles = [
      // Effects system
      'src/lib/visual-effects-store.ts',
      'src/components/effects/VisualEffectsLayer.tsx',
      'src/components/effects/SparkleEffect.tsx',
      'src/components/effects/FloatingParticles.tsx',
      'src/components/effects/BokehEffect.tsx',
      'src/components/effects/DynamicLightSweep.tsx',
      'src/components/effects/ScrollReveal.tsx',
      'src/components/effects/SectionEffects.tsx',
      // Main page & layout
      'src/app/page.tsx',
      'src/app/layout.tsx',
      'src/app/globals.css',
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
      // Admin page
      'src/app/admin/page.tsx',
      // API routes
      'src/app/api/music/route.ts',
      'src/app/api/music/file/route.ts',
      'src/app/api/settings/route.ts',
      'src/app/api/couple-story/route.ts',
      'src/app/api/timeline/route.ts',
      'src/app/api/guests/route.ts',
      'src/app/api/guests/search/route.ts',
      'src/app/api/guests/[id]/route.ts',
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
      // Lib
      'src/lib/auth.ts',
      'src/lib/guest-auth.ts',
      'src/lib/db.ts',
      'src/lib/utils.ts',
      'src/lib/guest-utils.ts',
      'src/lib/rate-limit.ts',
      // Hooks
      'src/hooks/use-mobile.ts',
      'src/hooks/use-toast.ts',
      // Providers
      'src/components/providers/theme-provider.tsx',
      // Config files
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
      'src/middleware.ts',
    ];
    
    // Step 2: Create directories on VPS
    console.log('\n📁 Step 2: Creating directories on VPS...');
    const dirs = new Set();
    for (const file of criticalFiles) {
      const dir = dirname(file);
      dirs.add(`${DEPLOY_DIR}/${dir}`);
    }
    for (const dir of dirs) {
      await runCommand(`mkdir -p ${dir}`);
    }
    
    // Step 3: Upload files one by one with delays
    console.log('\n📤 Step 3: Uploading files...');
    let uploaded = 0;
    let failed = 0;
    
    for (const file of criticalFiles) {
      const localPath = join(PROJECT_DIR, file);
      const remotePath = `${DEPLOY_DIR}/${file}`;
      
      if (!existsSync(localPath)) {
        console.log(`  ⏭ Skipping (not found): ${file}`);
        continue;
      }
      
      try {
        await uploadFile(localPath, remotePath);
        uploaded++;
        if (uploaded % 10 === 0) console.log(`  → Progress: ${uploaded} files uploaded...`);
        // Small delay to prevent SSH channel overload
        await sleep(100);
      } catch (e) {
        failed++;
        console.log(`  ❌ Failed: ${file} - ${e.message}`);
        // Wait longer after a failure
        await sleep(2000);
        // Retry once
        try {
          await uploadFile(localPath, remotePath);
          uploaded++;
          failed--;
          console.log(`  ✅ Retry succeeded: ${file}`);
        } catch (e2) {
          console.log(`  ❌ Retry failed: ${file}`);
        }
      }
    }
    console.log(`  ✅ Total uploaded: ${uploaded}, Failed: ${failed}`);
    
    // Step 4: Upload public assets that are needed
    console.log('\n📤 Step 4: Uploading public assets...');
    const publicFiles = [
      'public/manifest.json',
      'public/robots.txt',
      'public/sw.js',
      'public/logo.svg',
      'public/aenews-logo.png',
    ];
    
    await runCommand(`mkdir -p ${DEPLOY_DIR}/public/uploads ${DEPLOY_DIR}/public/photos ${DEPLOY_DIR}/public/icons`);
    
    for (const file of publicFiles) {
      const localPath = join(PROJECT_DIR, file);
      if (existsSync(localPath)) {
        try {
          await uploadFile(localPath, `${DEPLOY_DIR}/${file}`);
          await sleep(100);
        } catch (e) {
          console.log(`  ⚠ Skip public file: ${file}`);
        }
      }
    }
    
    // Step 5: Rebuild and restart Docker
    console.log('\n🔨 Step 5: Rebuilding Docker image (this takes a few minutes)...');
    await runCommand(`cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 | tail -20`, 300000);
    
    console.log('\n🚀 Step 6: Restarting container...');
    await runCommand(`cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml up -d 2>&1`);
    
    console.log('\n⏳ Step 7: Waiting for container to start...');
    await sleep(25000);
    
    console.log('\n🔍 Step 8: Checking container status...');
    await runCommand(`docker ps --filter name=wedding-app --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"`);
    
    console.log('\n🧪 Step 9: Testing site...');
    await runCommand(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/`);
    await runCommand(`curl -s http://127.0.0.1:3080/api/settings 2>&1 | head -c 200`);
    await runCommand(`curl -s http://127.0.0.1:3080/api/music 2>&1 | head -c 200`);
    await runCommand(`curl -s http://127.0.0.1:3080/api/couple-story 2>&1 | head -c 200`);
    await runCommand(`curl -s http://127.0.0.1:3080/api/timeline 2>&1 | head -c 200`);
    
    console.log('\n✅ Deployment complete!');
  } catch (err) {
    console.error('❌ Deployment error:', err);
  }
  
  conn.end();
});

conn.on('error', (err) => {
  console.error('❌ SSH connection error:', err.message);
});

console.log(`Connecting to ${VPS_USER}@${VPS_HOST}...`);
conn.connect({
  host: VPS_HOST,
  port: 22,
  username: VPS_USER,
  password: VPS_PASS,
  readyTimeout: 60000,
  keepaliveInterval: 10000,
  keepaliveCountMax: 10,
});
