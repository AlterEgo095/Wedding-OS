import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

// All source files to sync (non-ui components, pages, API routes, libs, hooks)
const FILES_TO_UPDATE = [
  // App pages & layout
  'src/app/page.tsx',
  'src/app/layout.tsx',
  'src/app/globals.css',
  // API routes
  'src/app/api/route.ts',
  'src/app/api/couple-story/route.ts',
  'src/app/api/settings/route.ts',
  'src/app/api/tables/route.ts',
  'src/app/api/media/route.ts',
  'src/app/api/timeline/route.ts',
  'src/app/api/admin/login/route.ts',
  'src/app/api/admin/users/route.ts',
  'src/app/api/admin/dashboard/route.ts',
  'src/app/api/guest/lookup/route.ts',
  'src/app/api/guest/invite/route.ts',
  'src/app/api/guest/auto-auth/route.ts',
  'src/app/api/guest/logout/route.ts',
  'src/app/api/guest/rsvp/route.ts',
  'src/app/api/guest/auth/route.ts',
  'src/app/api/guest/me/route.ts',
  'src/app/api/guest/access-logs/route.ts',
  'src/app/api/guests/route.ts',
  'src/app/api/guests/search/route.ts',
  'src/app/api/guests/export/route.ts',
  'src/app/api/guests/import/route.ts',
  'src/app/api/guests/import-docx/route.ts',
  // Lib
  'src/lib/auth.ts',
  'src/lib/db.ts',
  'src/lib/guest-auth.ts',
  'src/lib/guest-utils.ts',
  'src/lib/rate-limit.ts',
  'src/lib/utils.ts',
  // Hooks
  'src/hooks/use-mobile.ts',
  'src/hooks/use-toast.ts',
  // Middleware
  'src/middleware.ts',
  // Components (non-ui)
  'src/components/AENEWSBanner.tsx',
  'src/components/CoupleGallery.tsx',
  'src/components/CouplePhotosSection.tsx',
  'src/components/EventTimeline.tsx',
  'src/components/Footer.tsx',
  'src/components/GuestAuthForm.tsx',
  'src/components/GuestAuthProvider.tsx',
  'src/components/GuestPersonalSpace.tsx',
  'src/components/GuestSearch.tsx',
  'src/components/HeroSection.tsx',
  'src/components/InvitationCard.tsx',
  'src/components/MapSection.tsx',
  'src/components/MarketingSection.tsx',
  'src/components/Navigation.tsx',
  'src/components/OurStory.tsx',
  'src/components/PWAInstall.tsx',
  'src/components/PremiumGallery.tsx',
  'src/components/providers/theme-provider.tsx',
  // Admin components
  'src/components/admin/AccessLogManager.tsx',
  'src/components/admin/AdminPanel.tsx',
  'src/components/admin/Dashboard.tsx',
  'src/components/admin/GuestManager.tsx',
  'src/components/admin/LoginForm.tsx',
  'src/components/admin/MediaManager.tsx',
  'src/components/admin/SettingsManager.tsx',
  'src/components/admin/TableManager.tsx',
  'src/components/admin/TimelineManager.tsx',
  'src/components/admin/UserManager.tsx',
];

// Config files
const CONFIG_FILES = [
  'next.config.ts',
  'tailwind.config.ts',
  'tsconfig.json',
  'postcss.config.mjs',
  'components.json',
  'prisma/schema.prisma',
];

const conn = new Client();

function runCommand(conn, cmd, timeout = 30000) {
  return new Promise((resolve, reject) => {
    console.log(`  → ${cmd.substring(0, 100)}...`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', (data) => { stdout += data.toString(); });
      stream.stderr.on('data', (data) => { stderr += data.toString(); });
      stream.on('close', (code) => {
        if (stdout.trim()) console.log(`  ✓ ${stdout.trim().substring(0, 300)}`);
        if (stderr.trim() && !stderr.includes('WARNING') && !stderr.includes('npm warn')) {
          console.log(`  ⚠ ${stderr.trim().substring(0, 200)}`);
        }
        resolve({ code, stdout, stderr });
      });
    });
  });
}

async function uploadFile(conn, localPath, remotePath) {
  const content = readFileSync(localPath, 'utf8');
  const b64 = Buffer.from(content).toString('base64');
  // Split into chunks to avoid command line length limits
  const CHUNK_SIZE = 40000;
  if (b64.length <= CHUNK_SIZE) {
    await runCommand(conn, `echo '${b64}' | base64 -d > "${remotePath}"`);
  } else {
    // Write in chunks
    await runCommand(conn, `echo -n '' > "${remotePath}"`); // Clear file
    for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
      const chunk = b64.substring(i, i + CHUNK_SIZE);
      const isAppend = i > 0;
      await runCommand(conn, `echo '${chunk}' | base64 -d ${isAppend ? '>>' : '>'} "${remotePath}"`);
    }
  }
}

conn.on('ready', async () => {
  console.log('✅ Connected to VPS!');
  
  try {
    // Step 1: Upload all source files
    console.log('\n📦 Uploading source files...');
    for (const file of FILES_TO_UPDATE) {
      const localPath = join(process.cwd(), file);
      const remotePath = `${DEPLOY_DIR}/${file}`;
      try {
        const content = readFileSync(localPath, 'utf8');
        const b64 = Buffer.from(content).toString('base64');
        console.log(`  ↑ ${file} (${(b64.length / 1024).toFixed(1)}KB)`);
        if (b64.length <= 40000) {
          await runCommand(conn, `echo '${b64}' | base64 -d > "${remotePath}"`);
        } else {
          await runCommand(conn, `echo -n '' > "${remotePath}"`);
          for (let i = 0; i < b64.length; i += 40000) {
            const chunk = b64.substring(i, i + 40000);
            const isAppend = i > 0;
            await runCommand(conn, `echo '${chunk}' | base64 -d ${isAppend ? '>>' : '>'} "${remotePath}"`);
          }
        }
      } catch (e) {
        console.log(`  ⚠ Skipped ${file}: ${e.message}`);
      }
    }

    // Step 2: Upload config files
    console.log('\n📦 Uploading config files...');
    for (const file of CONFIG_FILES) {
      const localPath = join(process.cwd(), file);
      const remotePath = `${DEPLOY_DIR}/${file}`;
      try {
        const content = readFileSync(localPath, 'utf8');
        const b64 = Buffer.from(content).toString('base64');
        console.log(`  ↑ ${file} (${(b64.length / 1024).toFixed(1)}KB)`);
        await runCommand(conn, `echo '${b64}' | base64 -d > "${remotePath}"`);
      } catch (e) {
        console.log(`  ⚠ Skipped ${file}: ${e.message}`);
      }
    }

    // Step 3: Upload public assets
    console.log('\n📦 Checking public assets...');
    const publicAssets = ['public/aenews-logo.png', 'public/manifest.json'];
    for (const file of publicAssets) {
      const localPath = join(process.cwd(), file);
      const remotePath = `${DEPLOY_DIR}/${file}`;
      try {
        const content = readFileSync(localPath);
        const b64 = Buffer.from(content).toString('base64');
        console.log(`  ↑ ${file} (${(b64.length / 1024).toFixed(1)}KB)`);
        // For binary files, split into chunks
        await runCommand(conn, `echo -n '' > "${remotePath}"`);
        for (let i = 0; i < b64.length; i += 40000) {
          const chunk = b64.substring(i, i + 40000);
          await runCommand(conn, `echo '${chunk}' | base64 -d >> "${remotePath}"`);
        }
      } catch (e) {
        console.log(`  ⚠ Skipped ${file}: ${e.message}`);
      }
    }

    // Step 4: Verify key file has AENEWSBanner import
    console.log('\n🔍 Verifying page.tsx has AENEWSBanner...');
    const verifyResult = await runCommand(conn, `grep -c "AENEWSBanner" ${DEPLOY_DIR}/src/app/page.tsx`);
    if (verifyResult.stdout.trim() === '0') {
      console.log('  ❌ AENEWSBanner not found in page.tsx! Something went wrong.');
    } else {
      console.log(`  ✅ AENEWSBanner found (${verifyResult.stdout.trim()} references)`);
    }

    // Step 5: Rebuild and restart Docker
    console.log('\n🔨 Rebuilding Docker image (this may take a few minutes)...');
    await runCommand(conn, `cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 | tail -10`, 300000);
    
    console.log('\n🚀 Restarting container...');
    await runCommand(conn, `cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml up -d 2>&1`);
    
    console.log('\n⏳ Waiting for app to start (30s)...');
    await new Promise(r => setTimeout(r, 30000));
    
    console.log('\n🔍 Checking container status...');
    await runCommand(conn, `docker ps --filter name=wedding-app --format "{{.Names}}: {{.Status}}"`);
    
    console.log('\n🧪 Testing production endpoint...');
    await runCommand(conn, `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/ 2>&1`);
    await runCommand(conn, `curl -s http://127.0.0.1:3080/api/settings 2>&1 | head -c 200`);

    console.log('\n🧪 Testing if AENEWSBanner is in HTML response...');
    await runCommand(conn, `curl -s http://127.0.0.1:3080/ 2>&1 | grep -c "AENEWS" || echo "AENEWS not found in HTML"`);
    
    console.log('\n✅ Deployment complete!');
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
  readyTimeout: 30000,
});
