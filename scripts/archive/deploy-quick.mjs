import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

// Only the most critical files that are missing/outdated on VPS
const CRITICAL_FILES = [
  'src/app/page.tsx',
  'src/app/globals.css',
  'src/components/AENEWSBanner.tsx',
  'src/components/HeroSection.tsx',
  'src/components/Footer.tsx',
  'src/components/Navigation.tsx',
  'src/components/OurStory.tsx',
  'src/components/EventTimeline.tsx',
  'src/components/MapSection.tsx',
  'src/components/PremiumGallery.tsx',
  'src/components/GuestAuthForm.tsx',
  'src/components/GuestAuthProvider.tsx',
  'src/components/GuestPersonalSpace.tsx',
  'src/components/InvitationCard.tsx',
  'src/components/GuestSearch.tsx',
  'src/components/CoupleGallery.tsx',
  'src/components/CouplePhotosSection.tsx',
  'src/components/MarketingSection.tsx',
  'src/components/PWAInstall.tsx',
  'src/components/providers/theme-provider.tsx',
  'src/components/admin/AdminPanel.tsx',
  'src/components/admin/Dashboard.tsx',
  'src/components/admin/GuestManager.tsx',
  'src/components/admin/LoginForm.tsx',
  'src/components/admin/SettingsManager.tsx',
  'src/components/admin/TableManager.tsx',
  'src/components/admin/TimelineManager.tsx',
  'src/components/admin/AccessLogManager.tsx',
  'src/components/admin/MediaManager.tsx',
  'src/components/admin/UserManager.tsx',
  'src/middleware.ts',
  'src/lib/auth.ts',
  'src/lib/db.ts',
  'src/lib/guest-auth.ts',
  'src/lib/guest-utils.ts',
  'src/lib/rate-limit.ts',
  'src/lib/utils.ts',
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
  'next.config.ts',
  'tailwind.config.ts',
  'prisma/schema.prisma',
];

const conn = new Client();

function runCmd(cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '', err2 = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => err2 += d);
      stream.on('close', () => resolve({ out, err: err2 }));
    });
  });
}

async function uploadB64(localPath, remotePath) {
  const content = readFileSync(localPath, 'utf8');
  const b64 = Buffer.from(content).toString('base64');
  const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
  await runCmd(`mkdir -p "${dir}"`);
  
  if (b64.length <= 55000) {
    await runCmd(`echo '${b64}' | base64 -d > "${remotePath}"`);
  } else {
    await runCmd(`printf '' > "${remotePath}"`);
    for (let i = 0; i < b64.length; i += 55000) {
      const chunk = b64.substring(i, i + 55000);
      await runCmd(`echo '${chunk}' | base64 -d >> "${remotePath}"`);
    }
  }
}

conn.on('ready', async () => {
  console.log('✅ Connected!');
  const t0 = Date.now();
  
  try {
    // Phase 1: Upload all files
    for (let i = 0; i < CRITICAL_FILES.length; i++) {
      const file = CRITICAL_FILES[i];
      const localPath = join(process.cwd(), file);
      const remotePath = `${DEPLOY_DIR}/${file}`;
      try {
        await uploadB64(localPath, remotePath);
      } catch (e) {
        console.log(`  ⚠ ${file}: ${e.message}`);
      }
      if ((i + 1) % 15 === 0) console.log(`  ↑ ${i+1}/${CRITICAL_FILES.length} uploaded`);
    }
    console.log(`  ✅ All ${CRITICAL_FILES.length} files uploaded in ${((Date.now()-t0)/1000).toFixed(1)}s`);

    // Upload logo
    try {
      const logo = readFileSync(join(process.cwd(), 'public/aenews-logo.png'));
      const b64 = Buffer.from(logo).toString('base64');
      await runCmd(`printf '' > "${DEPLOY_DIR}/public/aenews-logo.png"`);
      for (let i = 0; i < b64.length; i += 55000) {
        await runCmd(`echo '${b64.substring(i, i + 55000)}' | base64 -d >> "${DEPLOY_DIR}/public/aenews-logo.png"`);
      }
      console.log('  ↑ aenews-logo.png uploaded');
    } catch(e) {}

    // Verify
    const v = await runCmd(`grep -c "AENEWSBanner" ${DEPLOY_DIR}/src/app/page.tsx`);
    console.log(`  AENEWSBanner refs: ${v.out.trim()}`);

    // Phase 2: Start Docker rebuild in background
    console.log('\n🔨 Starting Docker rebuild in background...');
    await runCmd(`cd ${DEPLOY_DIR} && rm -f /tmp/wedding-rebuild.status && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app >> /tmp/wedding-rebuild.log 2>&1 && docker compose -f docker-compose.prod.yml up -d >> /tmp/wedding-rebuild.log 2>&1 && echo "DONE $(date)" > /tmp/wedding-rebuild.status' > /dev/null 2>&1 &`);
    
    console.log('✅ Rebuild started in background on VPS!');
    console.log('   Check status later with: node -e "...ssh check..."');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  conn.end();
});

conn.on('error', (err) => console.error('❌ SSH error:', err.message));

console.log('Connecting...');
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
