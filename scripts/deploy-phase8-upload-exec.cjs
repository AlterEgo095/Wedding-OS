/**
 * deploy-phase8-upload-exec.cjs — Upload files via SSH exec + base64
 * More reliable than SFTP (which hangs on this VPS).
 * Usage: node deploy-phase8-upload-exec.cjs <batch_number>
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
  console.error('Usage: node deploy-phase8-upload-exec.cjs <1-6>');
  process.exit(1);
}

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function run(conn, cmd, t=30000) {
  return new Promise(r => {
    conn.exec(cmd, (e,s) => {
      if(e){r({stdout:'',stderr:e.message,code:-1});return;}
      let o='',er='';
      const tm=setTimeout(()=>{try{s.signal('TERM')}catch{}},t);
      s.on('close',c=>{clearTimeout(tm);r({stdout:o,stderr:er,code:c})});
      s.on('data',d=>{o+=d.toString()});
      s.stderr.on('data',d=>{er+=d.toString()});
    });
  });
}

async function main() {
  log(`=== BATCH ${batchNum} (${files.length} files via exec) ===`);

  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res);
    conn.on('error', rej);
    conn.connect(VPS_CONFIG);
  });
  log('SSH connected');

  for (const f of files) {
    const localPath = path.join(PROJECT_ROOT, f);
    const remotePath = `${REMOTE_ROOT}/${f}`;
    const remoteDir = path.posix.dirname(remotePath);

    // Create remote dir
    await run(conn, `mkdir -p ${remoteDir}`);

    // Read file, base64-encode, write via exec
    const content = fs.readFileSync(localPath);
    const b64 = content.toString('base64');
    const size = content.length;

    // Write file via base64 decode (handles any content safely)
    const writeCmd = `echo '${b64}' | base64 -d > ${remotePath} && wc -c ${remotePath}`;
    const res = await run(conn, writeCmd, 30000);
    if (res.code !== 0) {
      log(`  ✗ FAILED: ${f} — ${res.stderr}`);
    } else {
      log(`  ✓ ${f} (${size} bytes) — ${res.stdout.trim()}`);
    }
  }

  conn.end();
  log(`=== BATCH ${batchNum} COMPLETE ===`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
