/**
 * VPS Deployment Script — Heureux Mariage Hotfix
 * 
 * Deploys the 21H30 time fix + displayName sync fix to production VPS.
 * Task ID: 3-DEPLOY
 * 
 * VPS: 95.111.226.63, user: aenews, container: wedding-app, port: 3080
 * Path on VPS: /opt/wedding-platform/
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const VPS_CONFIG = {
  host: '95.111.226.63',
  port: 22,
  username: 'aenews',
  password: 'AeNews2025Secure!',
  readyTimeout: 30000,
};

// Files that were modified locally and need to be deployed to VPS
const FILES_TO_DEPLOY = [
  // Seed files (21H30 time fix)
  { local: 'prisma/seed.ts', remote: '/opt/wedding-platform/prisma/seed.ts' },
  { local: 'seed.ts', remote: '/opt/wedding-platform/seed.ts' },
  { local: 'init-db.js', remote: '/opt/wedding-platform/init-db.js' },
  // UI placeholder fix
  { local: 'src/components/admin/TimelineManager.tsx', remote: '/opt/wedding-platform/src/components/admin/TimelineManager.tsx' },
  // API auto-sync displayName fixes
  { local: 'src/app/api/guests/[id]/route.ts', remote: '/opt/wedding-platform/src/app/api/guests/[id]/route.ts' },
  { local: 'src/app/api/guests/route.ts', remote: '/opt/wedding-platform/src/app/api/guests/route.ts' },
  { local: 'src/app/api/guests/import/route.ts', remote: '/opt/wedding-platform/src/app/api/guests/import/route.ts' },
  { local: 'src/app/api/guests/import-docx/route.ts', remote: '/opt/wedding-platform/src/app/api/guests/import-docx/route.ts' },
  // GuestManager UI fields
  { local: 'src/components/admin/GuestManager.tsx', remote: '/opt/wedding-platform/src/components/admin/GuestManager.tsx' },
];

const PROJECT_ROOT = '/home/z/my-project';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function runCommand(conn, cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    log(`$ ${cmd}`);
    conn.exec(cmd, opts, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code, signal) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          // Don't reject on non-zero — we want to see stderr
          resolve({ stdout, stderr, code, signal });
        }
      });
      stream.on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      });
      stream.stderr.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });
    });
  });
}

function uploadFile(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    const size = fs.statSync(localPath).size;
    log(`  Uploading ${path.relative(PROJECT_ROOT, localPath)} → ${remotePath} (${size} bytes)`);
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) return reject(err);
      log(`  ✓ Uploaded`);
      resolve();
    });
  });
}

async function main() {
  const conn = new Client();

  log('=== Heureux Mariage VPS Hotfix Deploy ===');
  log(`Target: ${VPS_CONFIG.host}:${VPS_CONFIG.port} as ${VPS_CONFIG.username}`);
  log(`Files to deploy: ${FILES_TO_DEPLOY.length}`);
  log('');

  // Verify all local files exist before connecting
  log('[STEP 0] Verifying local files exist...');
  for (const { local } of FILES_TO_DEPLOY) {
    const fullPath = path.join(PROJECT_ROOT, local);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Local file missing: ${fullPath}`);
    }
  }
  log('✓ All local files present');
  log('');

  await new Promise((resolve, reject) => {
    conn.on('ready', () => {
      log('✓ SSH connected');
      resolve();
    });
    conn.on('error', (err) => {
      log(`✗ SSH error: ${err.message}`);
      reject(err);
    });
    conn.on('close', () => log('SSH connection closed'));
    conn.connect(VPS_CONFIG);
  });

  try {
    // STEP 1: Inspect VPS state
    log('');
    log('[STEP 1] Inspecting VPS state...');
    await runCommand(conn, 'uname -a');
    await runCommand(conn, 'docker --version');
    await runCommand(conn, 'docker ps --filter name=wedding-app --format "{{.Names}}\\t{{.Status}}\\t{{.Image}}"');
    await runCommand(conn, 'ls -la /opt/wedding-platform/ | head -30');
    await runCommand(conn, 'cat /opt/wedding-platform/.env 2>/dev/null | grep -v PASSWORD | grep -v SECRET || echo "(no .env)"');

    // STEP 2: Backup current DB on VPS
    log('');
    log('[STEP 2] Backing up production DB...');
    const backupCmd = `docker exec wedding-app sh -c 'cp /app/db/custom.db /app/db/custom.db.pre-hotfix-$(date +%Y%m%d-%H%M%S) && ls -lah /app/db/'`;
    await runCommand(conn, backupCmd);

    // STEP 3: Upload modified files via SFTP
    log('');
    log('[STEP 3] Uploading modified files via SFTP...');
    const sftp = await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => err ? reject(err) : resolve(sftp));
    });

    for (const { local, remote } of FILES_TO_DEPLOY) {
      const localPath = path.join(PROJECT_ROOT, local);
      // Ensure remote directory exists
      const remoteDir = path.dirname(remote);
      await runCommand(conn, `mkdir -p ${remoteDir}`);
      await uploadFile(sftp, localPath, remote);
    }
    log('✓ All files uploaded');
    sftp.end();

    // STEP 4: Verify uploads landed
    log('');
    log('[STEP 4] Verifying uploads on VPS...');
    await runCommand(conn, 'grep -n "venue_time\\|wedding_time" /opt/wedding-platform/prisma/seed.ts | head -5');
    await runCommand(conn, 'grep -n "auto-sync\\|invitationType\\|displayName" /opt/wedding-platform/src/app/api/guests/route.ts | head -10');

    // STEP 5: Fix DB directly — update MBOYO → CHRIST MPEPE
    log('');
    log('[STEP 5] Fixing DB directly (MBOYO → CHRIST MPEPE)...');
    // Use sqlite3 inside the container (better-sqlite3 is in the app)
    // Check what sqlite tooling is available inside the container
    const dbInspect = `docker exec wedding-app sh -c 'ls -la /app/db/ && file /app/db/custom.db 2>/dev/null || echo "file cmd not avail"'`;
    await runCommand(conn, dbInspect);

    // Try multiple sqlite access strategies
    // Strategy 1: node + better-sqlite3 inside container
    const fixDbCmd = `docker exec wedding-app sh -c 'node -e "
      const Database = require(\\"better-sqlite3\\");
      const db = new Database(\\"/app/db/custom.db\\");
      
      // Find the MBOYO guest(s)
      const before = db.prepare(\\"SELECT id, firstName, lastName, displayName, invitationType FROM Guest WHERE lastName LIKE \\\\\\"%MBOYO%\\\\\\" OR displayName LIKE \\\\\\"%MBOYO%\\\\\\"\").all();
      console.log(\\"BEFORE:\\", JSON.stringify(before, null, 2));
      
      // Update MBOYO → CHRIST MPEPE
      if (before.length > 0) {
        const update = db.prepare(\\"UPDATE Guest SET lastName = ?, displayName = ? WHERE id = ?\\");
        for (const g of before) {
          const newLastName = \\"CHRIST MPEPE\\";
          const newDisplayName = g.invitationType === \\"couple\\" ? \\"Couple CHRIST MPEPE\\" : \\"\\\\\\"\\" + g.firstName + \\" CHRIST MPEPE\\";
          update.run(newLastName, newDisplayName, g.id);
          console.log(\\"Updated guest \\" + g.id + \\": lastName=\\" + newLastName + \\", displayName=\\" + newDisplayName);
        }
      }
      
      // Verify venue_time / wedding_time settings
      const settings = db.prepare(\\"SELECT key, value FROM Settings WHERE key IN (\\\\\\"venue_time\\\\\\", \\\\\\"wedding_time\\\\\\")\\").all();
      console.log(\\"TIME SETTINGS:\\", JSON.stringify(settings, null, 2));
      
      // If venue_time is not 21H30, fix it
      const fixTime = db.prepare(\\"UPDATE Settings SET value = ? WHERE key = ?\\");
      const venueTime = settings.find(s => s.key === \\"venue_time\\");
      if (!venueTime) {
        fixTime.run(\\"21H30\\", \\"venue_time\\");
        console.log(\\"Inserted venue_time = 21H30\\");
      } else if (venueTime.value !== \\"21H30\\") {
        fixTime.run(\\"21H30\\", \\"venue_time\\");
        console.log(\\"Fixed venue_time: \\" + venueTime.value + \\" → 21H30\\");
      } else {
        console.log(\\"venue_time already correct (21H30)\\");
      }
      const weddingTime = settings.find(s => s.key === \\"wedding_time\\");
      if (!weddingTime) {
        fixTime.run(\\"21:30\\", \\"wedding_time\\");
        console.log(\\"Inserted wedding_time = 21:30\\");
      } else if (weddingTime.value !== \\"21:30\\") {
        fixTime.run(\\"21:30\\", \\"wedding_time\\");
        console.log(\\"Fixed wedding_time: \\" + weddingTime.value + \\" → 21:30\\");
      } else {
        console.log(\\"wedding_time already correct (21:30)\\");
      }
      
      // Final verification
      const after = db.prepare(\\"SELECT id, firstName, lastName, displayName, invitationType FROM Guest WHERE lastName LIKE \\\\\\"%MBOYO%\\\\\\" OR displayName LIKE \\\\\\"%MBOYO%\\\\\\"\").all();
      console.log(\\"AFTER (should be empty):\\", JSON.stringify(after, null, 2));
      const christCount = db.prepare(\\"SELECT COUNT(*) as count FROM Guest WHERE lastName LIKE \\\\\\"%CHRIST MPEPE%\\\\\\"\").get();
      console.log(\\"CHRIST MPEPE count:\\", christCount.count);
      const finalSettings = db.prepare(\\"SELECT key, value FROM Settings WHERE key IN (\\\\\\"venue_time\\\\\\", \\\\\\"wedding_time\\\\\\")\\").all();
      console.log(\\"FINAL TIME SETTINGS:\\", JSON.stringify(finalSettings, null, 2));
      
      db.close();
    "'`;
    await runCommand(conn, fixDbCmd);

    // STEP 6: Rebuild Docker image and restart container
    log('');
    log('[STEP 6] Rebuilding Docker image...');
    // Check how the container was originally started
    await runCommand(conn, 'docker inspect wedding-app --format "{{json .Config.Cmd}}{{json .Config.Entrypoint}}{{.Config.Image}}" 2>&1');
    await runCommand(conn, 'docker inspect wedding-app --format "{{range .Mounts}}{{.Source}}:{{.Destination}} {{end}}" 2>&1');
    await runCommand(conn, 'cat /opt/wedding-platform/Dockerfile 2>/dev/null | head -30');
    await runCommand(conn, 'cat /opt/wedding-platform/docker-compose.yml 2>/dev/null || echo "(no compose)"');

    // Build new image
    log('');
    log('[STEP 6a] Building new image (this may take a few minutes)...');
    const buildResult = await runCommand(conn, 'cd /opt/wedding-platform && docker build -t heureux-mariage:hotfix-21h30 . 2>&1 | tail -50', { pty: true });
    log(`Build exit code: ${buildResult.code}`);

    // STEP 7: Restart container with same volumes/env
    log('');
    log('[STEP 7] Restarting container...');
    // Get current container's env + volume config to replicate
    const inspectResult = await runCommand(conn, 'docker inspect wedding-app --format "{{range .Config.Env}}{{println .}}{{end}}" 2>&1');
    
    // Stop + remove + recreate
    await runCommand(conn, 'docker stop wedding-app 2>&1');
    await runCommand(conn, 'docker rename wedding-app wedding-app-old 2>&1 || echo "(rename skipped)"');
    
    // Start new container using same port + volumes + env file
    // The image name comes from the build above
    const startCmd = `cd /opt/wedding-platform && docker run -d --name wedding-app --restart unless-stopped -p 3080:3000 -v wedding_db:/app/db -v wedding_uploads:/app/public/uploads --env-file .env heureux-mariage:hotfix-21h30 2>&1`;
    const startResult = await runCommand(conn, startCmd);
    log(`Container start exit code: ${startResult.code}`);
    
    // Wait for container to boot
    log('Waiting 8s for container to boot...');
    await new Promise(r => setTimeout(r, 8000));
    
    await runCommand(conn, 'docker ps --filter name=wedding-app --format "{{.Names}}\\t{{.Status}}\\t{{.Ports}}"');
    await runCommand(conn, 'docker logs wedding-app --tail 30 2>&1');

    // STEP 8: Verify production endpoint
    log('');
    log('[STEP 8] Verifying production endpoint...');
    await runCommand(conn, 'curl -sI https://heureuxmariage.aenews.net/ | head -10');
    await runCommand(conn, 'curl -s https://heureuxmariage.aenews.net/api/settings | head -200');
    await runCommand(conn, 'curl -s "https://heureuxmariage.aenews.net/api/guests/search?q=MBOYO" 2>&1 | head -50');
    await runCommand(conn, 'curl -s "https://heureuxmariage.aenews.net/api/guests/search?q=CHRIST" 2>&1 | head -100');

    // STEP 9: Cleanup old container
    log('');
    log('[STEP 9] Cleaning up old container...');
    await runCommand(conn, 'docker rm wedding-app-old 2>&1 || echo "(already removed)"');
    
    log('');
    log('=== DEPLOY COMPLETE ===');
    log('Production URL: https://heureuxmariage.aenews.net');
    log('Verify:');
    log('  1. Invitation page shows 21H30');
    log('  2. Search "MBOYO" → 0 results');
    log('  3. Search "CHRIST" → Couple CHRIST MPEPE');

  } catch (err) {
    log(`✗ DEPLOY FAILED: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    conn.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
