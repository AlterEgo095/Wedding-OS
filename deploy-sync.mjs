import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

const KEY_FILES = [
  'src/app/page.tsx',
  'src/app/layout.tsx',
  'src/app/globals.css',
  'src/middleware.ts',
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
  'src/lib/auth.ts',
  'src/lib/db.ts',
  'src/lib/guest-auth.ts',
  'src/lib/guest-utils.ts',
  'src/lib/rate-limit.ts',
  'src/lib/utils.ts',
  'src/hooks/use-mobile.ts',
  'src/hooks/use-toast.ts',
  'next.config.ts',
  'tailwind.config.ts',
  'prisma/schema.prisma',
];

// API routes
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

const ALL_FILES = [...KEY_FILES, ...API_FILES];

const conn = new Client();

function runCommand(conn, cmd, timeout = 15000) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', (data) => { stdout += data.toString(); });
      stream.stderr.on('data', (data) => { stderr += data.toString(); });
      stream.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected to VPS!');
  
  try {
    // Upload files using a single tar-like approach
    console.log('\n📦 Uploading files...');
    let uploaded = 0, skipped = 0;
    
    for (const file of ALL_FILES) {
      const localPath = join(process.cwd(), file);
      const remotePath = `${DEPLOY_DIR}/${file}`;
      try {
        const content = readFileSync(localPath, 'utf8');
        const b64 = Buffer.from(content).toString('base64');
        
        // Ensure directory exists
        const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
        await runCommand(conn, `mkdir -p "${dir}"`);
        
        if (b64.length <= 50000) {
          await runCommand(conn, `echo '${b64}' | base64 -d > "${remotePath}"`);
        } else {
          // Clear file first
          await runCommand(conn, `echo -n '' > "${remotePath}"`);
          for (let i = 0; i < b64.length; i += 50000) {
            const chunk = b64.substring(i, i + 50000);
            await runCommand(conn, `echo '${chunk}' | base64 -d >> "${remotePath}"`);
          }
        }
        uploaded++;
        if (uploaded % 10 === 0) console.log(`  ↑ ${uploaded}/${ALL_FILES.length} files uploaded...`);
      } catch (e) {
        skipped++;
      }
    }
    
    console.log(`  ✅ ${uploaded} files uploaded, ${skipped} skipped`);

    // Upload aenews-logo.png
    console.log('\n📦 Uploading public assets...');
    try {
      const logoContent = readFileSync(join(process.cwd(), 'public/aenews-logo.png'));
      const b64 = Buffer.from(logoContent).toString('base64');
      await runCommand(conn, `echo -n '' > "${DEPLOY_DIR}/public/aenews-logo.png"`);
      for (let i = 0; i < b64.length; i += 50000) {
        const chunk = b64.substring(i, i + 50000);
        await runCommand(conn, `echo '${chunk}' | base64 -d >> "${DEPLOY_DIR}/public/aenews-logo.png"`);
      }
      console.log('  ↑ aenews-logo.png uploaded');
    } catch (e) {
      console.log(`  ⚠ aenews-logo.png: ${e.message}`);
    }

    // Verify
    console.log('\n🔍 Verifying deployment...');
    const verify = await runCommand(conn, `grep -c "AENEWSBanner" ${DEPLOY_DIR}/src/app/page.tsx`);
    console.log(`  AENEWSBanner references in page.tsx: ${verify.stdout.trim()}`);
    
    const verifyBanner = await runCommand(conn, `ls -la ${DEPLOY_DIR}/src/components/AENEWSBanner.tsx`);
    console.log(`  AENEWSBanner.tsx: ${verifyBanner.stdout.trim()}`);

    console.log('\n✅ File upload complete! Now rebuilding Docker...');
    
    // Rebuild with nohup so it continues even if connection drops
    await runCommand(conn, `cd ${DEPLOY_DIR} && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app && docker compose -f docker-compose.prod.yml up -d && echo "REBUILD_DONE" > /tmp/wedding-rebuild.status' > /tmp/wedding-rebuild.log 2>&1 &`);
    
    console.log('\n⏳ Docker rebuild started in background. Checking status...');
    console.log('   (This will take 3-5 minutes. The rebuild is running on the VPS.)');
    
    // Wait and check
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 30000));
      const status = await runCommand(conn, `cat /tmp/wedding-rebuild.status 2>/dev/null || echo "BUILDING..."`);
      console.log(`  [${(i+1)*30}s] ${status.stdout.trim()}`);
      if (status.stdout.trim().includes('REBUILD_DONE')) {
        console.log('\n🎉 Rebuild complete!');
        break;
      }
    }
    
    // Final check
    console.log('\n🔍 Final status check...');
    await runCommand(conn, `docker ps --filter name=wedding-app --format "{{.Names}}: {{.Status}}"`);
    await runCommand(conn, `curl -s -o /dev/null -w "HTTP %{http_code}" http://127.0.0.1:3080/`);
    
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
