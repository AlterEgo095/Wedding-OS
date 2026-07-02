/**
 * deploy-phase8-retry.cjs — Retry Phase 8 (Themes & Customization) deployment to VPS
 *
 * Strategy:
 * 1. Health check (memory, container, production HTTP)
 * 2. Cleanup orphaned buildkit/npm processes from previous failed build
 * 3. Add swap space (VPS has ~2GB RAM, build OOM'd before)
 * 4. Build with memory limit (NODE_OPTIONS=--max-old-space-size=512)
 * 5. If build succeeds: force-recreate container, verify endpoints
 * 6. Fallback if build fails: docker cp + docker exec npm run build inside running container
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const VPS_CONFIG = { host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 30000 };
const PROJECT_ROOT = '/home/z/my-project';

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function run(conn, cmd, t=60000) {
  return new Promise(r => {
    log(`\n$ ${cmd}`);
    conn.exec(cmd, (e,s) => {
      if(e){log('ERR:'+e.message);r({stdout:'',stderr:e.message,code:-1});return;}
      let o='',er='';
      const tm=setTimeout(()=>{try{s.signal('TERM')}catch{};log(`(timeout ${t}ms)`)},t);
      s.on('close',c=>{clearTimeout(tm);r({stdout:o,stderr:er,code:c})});
      s.on('data',d=>{o+=d.toString();process.stdout.write(d)});
      s.stderr.on('data',d=>{er+=d.toString();process.stderr.write(d)});
    });
  });
}

async function main() {
  log('=== DEPLOY PHASE 8 RETRY ===');

  const conn = new Client();
  await new Promise((res,rej)=>{
    conn.on('ready',res);
    conn.on('error',rej);
    conn.connect(VPS_CONFIG);
  });
  log('SSH connected');

  // ── STEP 1: Health check ──
  log('\n--- STEP 1: Health check ---');
  await run(conn, 'free -h');
  await run(conn, 'uptime');
  await run(conn, 'docker ps -a --filter name=wedding --format "{{.Names}}\\t{{.Status}}\\t{{.Ports}}"');
  await run(conn, 'curl -sI https://heureuxmariage.aenews.net/ 2>&1 | head -5');

  // ── STEP 2: Cleanup orphaned processes from previous failed build ──
  log('\n--- STEP 2: Cleanup orphaned buildkit/npm processes ---');
  await run(conn, 'pkill -f buildkitd 2>/dev/null || true');
  await run(conn, 'pkill -f "npm i" 2>/dev/null || true');
  await run(conn, 'pkill -f "npm install" 2>/dev/null || true');
  await run(conn, 'docker builder prune -f 2>&1 | tail -5 || true');
  await run(conn, 'free -h');

  // ── STEP 3: Add swap space (try sudo non-interactive) ──
  log('\n--- STEP 3: Add swap space ---');
  const swapCheck = await run(conn, 'swapon --show 2>&1');
  if (swapCheck.stdout && swapCheck.stdout.includes('/swapfile')) {
    log('Swap already present, skipping creation');
  } else {
    // Try with sudo -n (non-interactive) — if it fails, skip
    const swapCreate = await run(conn,
      'sudo -n bash -c \'fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo "/swapfile none swap sw 0 0" >> /etc/fstab\' 2>&1 || echo "SWAP_CREATE_FAILED"',
      60000
    );
    if (swapCreate.stdout.includes('SWAP_CREATE_FAILED')) {
      log('Could not create swap (sudo needs password) — continuing without swap');
    } else {
      log('Swap created successfully');
    }
    await run(conn, 'free -h');
  }

  // ── STEP 4: Verify Phase 8 files present on VPS ──
  log('\n--- STEP 4: Verify Phase 8 files present ---');
  await run(conn, 'ls -la /opt/wedding-platform/src/lib/themes/templates.ts /opt/wedding-platform/src/lib/custom-domains.ts /opt/wedding-platform/src/app/api/theme/route.ts /opt/wedding-platform/src/app/api/theme/apply-template/route.ts /opt/wedding-platform/src/app/api/custom-domain/route.ts /opt/wedding-platform/src/components/wedding/ThemeInjector.tsx /opt/wedding-platform/src/components/admin/ThemeCustomizer.tsx 2>&1');

  // ── STEP 5: Docker build with memory limit ──
  log('\n--- STEP 5: Docker build with memory limit ---');
  const buildRes = await run(conn,
    'cd /opt/wedding-platform && NODE_OPTIONS=--max-old-space-size=512 docker compose build app 2>&1 | tail -100',
    540000
  );
  log(`\nBuild exit code: ${buildRes.code}`);

  if (buildRes.code === 0) {
    // ── STEP 6a: Build succeeded — force-recreate container ──
    log('\n--- STEP 6a: Restart container with new image ---');
    await run(conn, 'cd /opt/wedding-platform && docker compose up -d --force-recreate --no-deps app 2>&1', 120000);
    log('Waiting 25s for boot...');
    await new Promise(r=>setTimeout(r,25000));

    // ── STEP 7: Verify Phase 8 endpoints ──
    log('\n--- STEP 7: Verify Phase 8 endpoints ---');
    await run(conn, 'docker ps --filter name=wedding-app --format "{{.Names}}\\t{{.Status}}\\t{{.Ports}}"');
    await run(conn, 'curl -sI https://heureuxmariage.aenews.net/ 2>&1 | head -5');
    await run(conn, 'curl -s -H "X-Wedding-Slug: josue-hornella" https://heureuxmariage.aenews.net/api/theme 2>&1 | head -c 600');
    await run(conn, 'curl -s -H "X-Wedding-Slug: josue-hornella" https://heureuxmariage.aenews.net/api/custom-domain 2>&1 | head -c 400');
    await run(conn, 'docker logs wedding-app --tail 30 2>&1');

    log('\n=== DEPLOY SUCCESS (build path) ===');
  } else {
    // ── STEP 6b: Build FAILED — fallback: docker cp + build inside running container ──
    log('\n--- STEP 6b: BUILD FAILED — trying FALLBACK (docker cp + docker exec build) ---');

    // Verify container still running (should be, since build failed)
    const psRes = await run(conn, 'docker ps --filter name=wedding-app --format "{{.Names}}\\t{{.Status}}"');
    if (!psRes.stdout.includes('wedding-app')) {
      log('Container is NOT running — cannot do fallback. Aborting.');
      conn.end();
      process.exit(1);
    }
    log('Container still running — proceeding with docker cp fallback');

    // Copy Phase 8 files into the running container
    const filesToCopy = [
      'src/lib/themes/templates.ts',
      'src/lib/custom-domains.ts',
      'src/app/api/theme/route.ts',
      'src/app/api/theme/apply-template/route.ts',
      'src/app/api/custom-domain/route.ts',
      'src/components/wedding/ThemeInjector.tsx',
      'src/components/admin/ThemeCustomizer.tsx',
    ];
    for (const f of filesToCopy) {
      await run(conn, `docker cp /opt/wedding-platform/${f} wedding-app:/app/${f} 2>&1`);
    }

    // Create directories inside container if missing
    await run(conn, 'docker exec wedding-app mkdir -p /app/src/lib/themes /app/src/app/api/theme /app/src/app/api/custom-domain /app/src/components/wedding /app/src/components/admin 2>&1');

    // Rebuild Next.js inside the container
    log('\n--- Building Next.js inside container ---');
    const execBuild = await run(conn, 'docker exec wedding-app sh -c "cd /app && NODE_OPTIONS=--max-old-space-size=512 npm run build" 2>&1 | tail -60', 540000);
    log(`\nIn-container build exit: ${execBuild.code}`);

    if (execBuild.code === 0) {
      // Restart container to pick up new build
      log('\n--- Restart container to reload build ---');
      await run(conn, 'docker restart wedding-app 2>&1', 60000);
      log('Waiting 25s for boot...');
      await new Promise(r=>setTimeout(r,25000));

      // Verify
      log('\n--- Verify after fallback ---');
      await run(conn, 'docker ps --filter name=wedding-app --format "{{.Names}}\\t{{.Status}}"');
      await run(conn, 'curl -sI https://heureuxmariage.aenews.net/ 2>&1 | head -5');
      await run(conn, 'curl -s -H "X-Wedding-Slug: josue-hornella" https://heureuxmariage.aenews.net/api/theme 2>&1 | head -c 600');
      await run(conn, 'curl -s -H "X-Wedding-Slug: josue-hornella" https://heureuxmariage.aenews.net/api/custom-domain 2>&1 | head -c 400');
      await run(conn, 'docker logs wedding-app --tail 30 2>&1');

      log('\n=== DEPLOY SUCCESS (fallback path) ===');
    } else {
      log('\n--- FALLBACK ALSO FAILED — checking container health ---');
      await run(conn, 'docker ps --filter name=wedding-app --format "{{.Names}}\\t{{.Status}}"');
      await run(conn, 'curl -sI https://heureuxmariage.aenews.net/ 2>&1 | head -5');
      log('\n=== DEPLOY FAILED — production should still be on Phase 7 ===');
    }
  }

  conn.end();
  log('\n=== SCRIPT COMPLETE ===');
}
main().catch(e=>{console.error('FATAL:',e);process.exit(1)});
