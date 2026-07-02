/**
 * deploy-phase8-upload.cjs — Upload all Phase 8 files to VPS via SFTP
 *
 * This script ONLY uploads files. The rebuild is done separately so we can
 * poll the build status without timing out.
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const VPS_CONFIG = { host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 30000 };
const PROJECT_ROOT = '/home/z/my-project';
const REMOTE_ROOT = '/opt/wedding-platform';

// Phase 8 files (new + modified)
const FILES_TO_SYNC = [
  // New Phase 8 files
  'src/lib/themes/templates.ts',
  'src/lib/custom-domains.ts',
  'src/app/api/theme/route.ts',
  'src/app/api/theme/apply-template/route.ts',
  'src/app/api/custom-domain/route.ts',
  'src/components/wedding/ThemeInjector.tsx',
  'src/components/admin/ThemeCustomizer.tsx',
  // Modified files (admin page + public pages with ThemeInjector integration)
  'src/app/platform/admin/page.tsx',
  'src/app/page.tsx',
  'src/app/w/[slug]/page.tsx',
];

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main() {
  log('=== PHASE 8 FILE UPLOAD ===');

  // Verify local files exist
  for (const f of FILES_TO_SYNC) {
    const localPath = path.join(PROJECT_ROOT, f);
    if (!fs.existsSync(localPath)) {
      log(`✗ Missing local: ${f}`);
      process.exit(1);
    }
  }
  log(`✓ All ${FILES_TO_SYNC.length} local files present`);

  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res);
    conn.on('error', rej);
    conn.connect(VPS_CONFIG);
  });
  log('SSH connected');

  const sftp = await new Promise((res, rej) => {
    conn.sftp((e, s) => (e ? rej(e) : res(s)));
  });

  // Upload each file (create remote dirs as needed)
  for (const f of FILES_TO_SYNC) {
    const localPath = path.join(PROJECT_ROOT, f);
    const remotePath = `${REMOTE_ROOT}/${f}`;
    const remoteDir = path.dirname(remotePath);

    // Create remote directory
    await new Promise((res) => {
      conn.exec(`mkdir -p ${remoteDir}`, (e, s) => {
        if (e) { res(); return; }
        s.on('close', () => res());
      });
    });

    // Upload
    await new Promise((res, rej) => {
      sftp.fastPut(localPath, remotePath, (err) => {
        if (err) rej(err);
        else res();
      });
    });
    const size = fs.statSync(localPath).size;
    log(`  ✓ ${f} (${size} bytes)`);
  }

  sftp.end();

  // Verify uploads
  log('\n=== Verify uploads ===');
  await new Promise((res) => {
    conn.exec(`cd ${REMOTE_ROOT} && ls -la src/lib/themes/templates.ts src/lib/custom-domains.ts src/app/api/theme/route.ts src/app/api/theme/apply-template/route.ts src/app/api/custom-domain/route.ts src/components/wedding/ThemeInjector.tsx src/components/admin/ThemeCustomizer.tsx`, (e, s) => {
      if (e) { res(); return; }
      let o = '';
      s.on('data', d => o += d.toString());
      s.on('close', () => { console.log(o); res(); });
    });
  });

  conn.end();
  log('\n=== UPLOAD COMPLETE ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
