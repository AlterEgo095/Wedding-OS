/**
 * deploy-phase8-upload-batch.cjs — Upload a batch of files
 * Usage: node deploy-phase8-upload-batch.cjs <batch_number>
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const VPS_CONFIG = { host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 15000 };
const PROJECT_ROOT = '/home/z/my-project';
const REMOTE_ROOT = '/opt/wedding-platform';

const BATCHES = {
  '1': [
    'src/lib/themes/templates.ts',
    'src/lib/custom-domains.ts',
  ],
  '2': [
    'src/app/api/theme/route.ts',
    'src/app/api/theme/apply-template/route.ts',
    'src/app/api/custom-domain/route.ts',
  ],
  '3': [
    'src/components/wedding/ThemeInjector.tsx',
    'src/components/admin/ThemeCustomizer.tsx',
  ],
  '4': [
    'src/app/platform/admin/page.tsx',
  ],
  '5': [
    'src/app/page.tsx',
  ],
  '6': [
    'src/app/w/[slug]/page.tsx',
  ],
};

const batchNum = process.argv[2];
const files = BATCHES[batchNum];
if (!files) {
  console.error('Usage: node deploy-phase8-upload-batch.cjs <1-6>');
  process.exit(1);
}

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

async function main() {
  log(`=== BATCH ${batchNum} (${files.length} files) ===`);

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

  for (const f of files) {
    const localPath = path.join(PROJECT_ROOT, f);
    const remotePath = `${REMOTE_ROOT}/${f}`;
    const remoteDir = path.posix.dirname(remotePath);

    // Create remote dir
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
  conn.end();
  log(`=== BATCH ${batchNum} COMPLETE ===`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
