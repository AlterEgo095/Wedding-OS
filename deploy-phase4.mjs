import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const VPS_CONFIG = { host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 30000 };
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

// Build tar.gz with all Phase 4 changed files + key infrastructure
const filesToSync = [
  'prisma/schema.prisma',
  'init-db.js',
  'src/lib/collections/index.ts',
  'src/lib/auth.ts',
  'src/lib/types.ts',
  'src/app/w/[slug]/admin/page.tsx',
  'src/app/api/collections/[id]/transition/route.ts',
  'src/app/api/designer/collections/route.ts',
  'src/components/collections/DesignerPortal.tsx',
  'package.json',
];

// Build tar with all src + prisma to be safe (full sync)
log('Building phase4-sync.tar.gz...');
try {
  execSync('tar -czf phase4-sync.tar.gz prisma/ src/ init-db.js package.json', { stdio: 'inherit' });
  const sz = fs.statSync('phase4-sync.tar.gz').size;
  log(`Built phase4-sync.tar.gz (${(sz/1024).toFixed(1)}K)`);
} catch (e) {
  log(`tar failed: ${e.message}`);
  process.exit(1);
}

const conn = new Client();
const exec = (cmd, t=120000) => new Promise((r) => {
  log(`$ ${cmd}`);
  conn.exec(cmd, (err, stream) => {
    if (err) { log(`ERR: ${err.message}`); return r({stdout:'',stderr:err.message,code:-1}); }
    let o='', e='';
    const tmr = setTimeout(() => { try { stream.signal('TERM'); } catch {} }, t);
    stream.on('close', (code) => {
      clearTimeout(tmr);
      if (o.trim()) log(`  out: ${o.trim().slice(0,1500)}`);
      if (e.trim()) log(`  err: ${e.trim().slice(0,1500)}`);
      log(`  exit: ${code}`);
      r({stdout:o, stderr:e, code});
    });
    stream.on('data', d => o += d.toString());
    stream.stderr.on('data', d => e += d.toString());
  });
});

conn.on('ready', async () => {
  log('SSH connected');
  
  // 1. Upload tar.gz via SFTP
  log('Uploading phase4-sync.tar.gz via SFTP...');
  await new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const rs = fs.createReadStream('phase4-sync.tar.gz');
      const ws = sftp.createWriteStream('/tmp/phase4-sync.tar.gz');
      rs.pipe(ws);
      ws.on('close', () => { log('  upload done'); resolve(); });
      ws.on('error', reject);
    });
  });
  
  // 2. Extract to /opt/wedding-platform
  await exec('cd /opt/wedding-platform && tar -xzf /tmp/phase4-sync.tar.gz && echo "extraction done"');
  await exec('rm /tmp/phase4-sync.tar.gz');
  
  // 3. Verify Phase 4 files are present on VPS
  await exec('grep -c "status.*COMMERCIALISE" /opt/wedding-platform/prisma/schema.prisma');
  await exec('grep -c "CollectionStatus" /opt/wedding-platform/src/lib/collections/index.ts');
  await exec('ls -la /opt/wedding-platform/src/components/collections/DesignerPortal.tsx');
  await exec('ls -la /opt/wedding-platform/src/app/api/collections/\\[id\\]/transition/route.ts');
  await exec('ls -la /opt/wedding-platform/src/app/api/designer/collections/route.ts');
  await exec('grep -c "ADD COLUMN.*status.*COMMERCIALISE" /opt/wedding-platform/init-db.js');
  
  // 4. Trigger no-cache docker rebuild via script
  log('Writing rebuild script...');
  await new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const script = `#!/bin/bash
set -e
cd /opt/wedding-platform
echo "=== Phase 4 rebuild started at $(date) ==="
docker compose build --no-cache app 2>&1 | tail -30
docker compose up -d --force-recreate app 2>&1 | tail -10
echo "=== Phase 4 deploy done at $(date) ==="
`;
      const ws = sftp.createWriteStream('/tmp/rebuild-phase4.sh');
      ws.end(script, 'utf-8', () => { log('  script written'); resolve(); });
      ws.on('error', reject);
    });
  });
  
  await exec('chmod +x /tmp/rebuild-phase4.sh && nohup /tmp/rebuild-phase4.sh > /tmp/phase4-deploy.log 2>&1 & echo "rebuild started PID=$!"');
  
  log('Rebuild running in background. Will poll status separately.');
  conn.end();
});

conn.on('error', e => { log(`SSH error: ${e.message}`); process.exit(1); });
conn.connect(VPS_CONFIG);
