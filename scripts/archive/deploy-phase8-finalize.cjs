/**
 * deploy-phase8-finalize.cjs — Wait for in-progress build to finish, then restart + verify
 *
 * The previous deploy-phase8-retry.cjs script started a Docker build that's still
 * running in the background (npm i + next build takes 5-9 min). This script:
 * 1. Polls every 30s for the build process to finish (max 10 min)
 * 2. Once finished, checks if the new image was created
 * 3. Force-recreates the container with the new image
 * 4. Verifies Phase 8 endpoints (/api/theme, /api/custom-domain)
 * 5. If build failed, falls back to docker cp + docker exec npm run build
 */
const { Client } = require('ssh2');

const VPS_CONFIG = { host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 30000 };

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

async function isBuildRunning(conn) {
  const res = await run(conn, 'pgrep -f "docker compose build" > /dev/null && echo RUNNING || echo DONE', 15000);
  return (res.stdout || '').includes('RUNNING');
}

async function main() {
  log('=== DEPLOY PHASE 8 FINALIZE ===');
  const conn = new Client();
  try {
    await new Promise((res,rej)=>{
      conn.on('ready',res);
      conn.on('error',rej);
      conn.connect(VPS_CONFIG);
    });
    log('SSH connected');

    // ── STEP 1: Poll for build completion ──
    log('\n--- STEP 1: Poll for build completion (max 10 min) ---');
    let buildDone = false;
    const maxWaitMs = 10 * 60 * 1000;
    const pollIntervalMs = 30 * 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const running = await isBuildRunning(conn);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      log(`  [${elapsed}s] Build running: ${running ? 'YES (waiting)' : 'NO (done)'}`);
      if (!running) { buildDone = true; break; }
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    if (!buildDone) {
      log('Build still running after 10 min — aborting wait');
      conn.end();
      process.exit(1);
    }
    log('✓ Build process finished');

    // ── STEP 2: Check if new image was built ──
    log('\n--- STEP 2: Check for new wedding-platform image ---');
    await run(conn, 'docker images | grep -i wedding');
    await run(conn, 'docker images --format "{{.Repository}}:{{.Tag}}\\t{{.CreatedSince}}\\t{{.Size}}" | grep -i wedding');

    // ── STEP 3: Force-recreate container with new image ──
    log('\n--- STEP 3: Force-recreate container ---');
    const recreateRes = await run(conn, 'cd /opt/wedding-platform && docker compose up -d --force-recreate --no-deps app 2>&1', 120000);
    log(`Recreate exit: ${recreateRes.code}`);
    log('Waiting 25s for boot...');
    await new Promise(r => setTimeout(r, 25000));

    // ── STEP 4: Verify container + endpoints ──
    log('\n--- STEP 4: Verify container + endpoints ---');
    await run(conn, 'docker ps --filter name=wedding-app --format "{{.Names}}\\t{{.Status}}\\t{{.Ports}}"');

    log('\n--- Production HTTP status ---');
    const httpRes = await run(conn, 'curl -sI https://heureuxmariage.aenews.net/ 2>&1 | head -5');

    log('\n--- /api/theme (Phase 8 endpoint) ---');
    const themeRes = await run(conn, 'curl -s -H "X-Wedding-Slug: josue-hornella" https://heureuxmariage.aenews.net/api/theme 2>&1 | head -c 600');
    const themeJson = (themeRes.stdout || '').trim();
    const themeIsJson = themeJson.startsWith('{') || themeJson.startsWith('[');

    log('\n--- /api/custom-domain (Phase 8 endpoint) ---');
    const domainRes = await run(conn, 'curl -s -H "X-Wedding-Slug: josue-hornella" https://heureuxmariage.aenews.net/api/custom-domain 2>&1 | head -c 400');
    const domainJson = (domainRes.stdout || '').trim();
    const domainIsJson = domainJson.startsWith('{') || domainJson.startsWith('[');

    log('\n--- Container logs ---');
    await run(conn, 'docker logs wedding-app --tail 25 2>&1');

    log('\n--- Files in container ---');
    await run(conn, 'docker exec wedding-app ls -la /app/src/app/api/theme/route.ts /app/src/app/api/custom-domain/route.ts /app/src/lib/themes/templates.ts 2>&1 || echo "FILES_NOT_IN_CONTAINER"');

    // ── STEP 5: If endpoints return HTML (not JSON), fall back to docker cp + in-container build ──
    if (!themeIsJson || !domainIsJson) {
      log('\n--- STEP 5: FALLBACK — endpoints not live, trying docker cp + in-container build ---');

      // Copy files into running container
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
        await run(conn, `docker exec wedding-app mkdir -p /app/$(dirname ${f}) 2>&1`);
        await run(conn, `docker cp /opt/wedding-platform/${f} wedding-app:/app/${f} 2>&1`);
      }
      log('Files copied into container');

      // Rebuild Next.js inside the container
      log('\n--- Building Next.js inside container (5-9 min) ---');
      const execBuild = await run(conn, 'docker exec wedding-app sh -c "cd /app && NODE_OPTIONS=--max-old-space-size=768 npm run build" 2>&1 | tail -80', 540000);
      log(`In-container build exit: ${execBuild.code}`);

      if (execBuild.code === 0) {
        log('\n--- Restart container to reload build ---');
        await run(conn, 'docker restart wedding-app 2>&1', 60000);
        log('Waiting 25s for boot...');
        await new Promise(r => setTimeout(r, 25000));

        log('\n--- Verify after fallback ---');
        await run(conn, 'docker ps --filter name=wedding-app --format "{{.Names}}\\t{{.Status}}"');
        await run(conn, 'curl -sI https://heureuxmariage.aenews.net/ 2>&1 | head -5');
        const themeRes2 = await run(conn, 'curl -s -H "X-Wedding-Slug: josue-hornella" https://heureuxmariage.aenews.net/api/theme 2>&1 | head -c 600');
        const domainRes2 = await run(conn, 'curl -s -H "X-Wedding-Slug: josue-hornella" https://heureuxmariage.aenews.net/api/custom-domain 2>&1 | head -c 400');
        await run(conn, 'docker logs wedding-app --tail 20 2>&1');

        const t2 = (themeRes2.stdout || '').trim();
        const d2 = (domainRes2.stdout || '').trim();
        if (t2.startsWith('{') && d2.startsWith('{')) {
          log('\n=== DEPLOY SUCCESS (fallback path) ===');
          log('Phase 8 endpoints LIVE');
        } else {
          log('\n=== FALLBACK ALSO FAILED ===');
        }
      } else {
        log('\n=== IN-CONTAINER BUILD FAILED ===');
      }
    } else {
      log('\n=== DEPLOY SUCCESS (build path) ===');
      log('Phase 8 endpoints LIVE');
    }

    conn.end();
    log('\n=== SCRIPT COMPLETE ===');
  } catch (e) {
    log('FAILED: ' + e.message);
    process.exit(1);
  }
}
main();
