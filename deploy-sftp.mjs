import { Client } from 'ssh2';
import { readFileSync, createReadStream } from 'fs';
import { join } from 'path';
import { basename } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

// Only the absolute minimum critical files
const CRITICAL_FILES = [
  'src/app/page.tsx',
  'src/components/AENEWSBanner.tsx',
  'src/components/HeroSection.tsx',
  'src/components/Footer.tsx',
  'src/components/Navigation.tsx',
  'src/components/GuestAuthForm.tsx',
  'src/components/GuestAuthProvider.tsx',
  'src/components/GuestPersonalSpace.tsx',
  'src/components/InvitationCard.tsx',
  'src/components/MarketingSection.tsx',
  'src/components/OurStory.tsx',
  'src/components/EventTimeline.tsx',
  'src/components/MapSection.tsx',
  'src/components/PremiumGallery.tsx',
  'src/components/CoupleGallery.tsx',
  'src/components/CouplePhotosSection.tsx',
  'src/components/PWAInstall.tsx',
  'src/components/GuestSearch.tsx',
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
  'src/app/globals.css',
  'next.config.ts',
  'tailwind.config.ts',
  'prisma/schema.prisma',
];

const API_FILES = [
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
];

const ALL = [...CRITICAL_FILES, ...API_FILES];

const conn = new Client();

function sftpUpload(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
    // Create directory recursively
    sftp.mkdir(dir, () => { // ignore error if exists
      const readStream = createReadStream(localPath);
      const writeStream = sftp.createWriteStream(remotePath);
      writeStream.on('close', resolve);
      writeStream.on('error', reject);
      readStream.on('error', reject);
      readStream.pipe(writeStream);
    });
  });
}

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

conn.on('ready', async () => {
  console.log('✅ Connected to VPS!');
  
  try {
    // Use SFTP for much faster file transfer
    console.log('\n📦 Uploading files via SFTP...');
    const sftp = await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) reject(err);
        else resolve(sftp);
      });
    });

    const t0 = Date.now();
    let uploaded = 0;
    
    for (const file of ALL) {
      const localPath = join(process.cwd(), file);
      const remotePath = `${DEPLOY_DIR}/${file}`;
      try {
        await sftpUpload(sftp, localPath, remotePath);
        uploaded++;
      } catch (e) {
        console.log(`  ⚠ ${file}: ${e.message}`);
      }
    }
    
    console.log(`  ✅ ${uploaded}/${ALL.length} files uploaded in ${((Date.now()-t0)/1000).toFixed(1)}s`);

    // Upload logo via SFTP
    try {
      await sftpUpload(sftp, join(process.cwd(), 'public/aenews-logo.png'), `${DEPLOY_DIR}/public/aenews-logo.png`);
      console.log('  ↑ aenews-logo.png uploaded');
    } catch(e) {
      console.log(`  ⚠ logo: ${e.message}`);
    }

    sftp.end();

    // Verify
    const v = await runCmd(`grep -c "AENEWSBanner" ${DEPLOY_DIR}/src/app/page.tsx`);
    console.log(`  AENEWSBanner refs in page.tsx: ${v.out.trim()}`);

    // Start Docker rebuild in background
    console.log('\n🔨 Starting Docker rebuild in background...');
    await runCmd(`cd ${DEPLOY_DIR} && rm -f /tmp/wedding-rebuild.status && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app >> /tmp/wedding-rebuild.log 2>&1 && docker compose -f docker-compose.prod.yml up -d >> /tmp/wedding-rebuild.log 2>&1 && echo "DONE $(date)" > /tmp/wedding-rebuild.status' > /dev/null 2>&1 &`);
    
    console.log('✅ Rebuild started in background on VPS!');
    console.log('   Use check-rebuild.mjs to monitor progress');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  conn.end();
});

conn.on('error', (err) => console.error('❌ SSH error:', err.message));

console.log('Connecting...');
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
