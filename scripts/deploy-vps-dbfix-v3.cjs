/**
 * DB Direct Fix v3 — uses Prisma client (available in container)
 * Fixes: MBOYO → CHRIST MPEPE + verifies 21H30 time settings
 */
const { Client } = require('ssh2');
const fs = require('fs');

const VPS_CONFIG = {
  host: '95.111.226.63', port: 22, username: 'aenews',
  password: 'AeNews2025Secure!', readyTimeout: 30000,
};

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function run(conn, cmd, timeoutMs = 60000) {
  return new Promise((resolve) => {
    log(`$ ${cmd}`);
    conn.exec(cmd, (err, stream) => {
      if (err) { log(`ERR: ${err.message}`); return resolve({ stdout: '', stderr: err.message, code: -1 }); }
      let stdout = '', stderr = '';
      const timer = setTimeout(() => { try { stream.signal('TERM'); } catch {} }, timeoutMs);
      stream.on('close', (code) => {
        clearTimeout(timer);
        if (stdout.trim()) log(`  out: ${stdout.trim()}`);
        if (stderr.trim()) log(`  err: ${stderr.trim().slice(0, 800)}`);
        log(`  exit: ${code}`);
        resolve({ stdout, stderr, code });
      });
      stream.on('data', (d) => { stdout += d.toString(); });
      stream.stderr.on('data', (d) => { stderr += d.toString(); });
    });
  });
}

// Use Prisma client (available in the container's /app/node_modules)
const DB_FIX_SCRIPT = `const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== DB FIX START (Prisma) ===');

  // 1. Find MBOYO guests
  const before = await prisma.guest.findMany({
    where: {
      OR: [
        { lastName: { contains: 'MBOYO' } },
        { displayName: { contains: 'MBOYO' } },
      ]
    },
    select: { id: true, firstName: true, lastName: true, displayName: true, invitationType: true }
  });
  console.log('BEFORE - MBOYO guests:', JSON.stringify(before, null, 2));

  // 2. Update MBOYO → CHRIST MPEPE
  if (before.length > 0) {
    for (const g of before) {
      const newLastName = 'CHRIST MPEPE';
      let newDisplayName;
      if (g.invitationType === 'couple') {
        newDisplayName = 'Couple CHRIST MPEPE';
      } else {
        newDisplayName = (g.firstName || '') + ' CHRIST MPEPE';
      }
      await prisma.guest.update({
        where: { id: g.id },
        data: { lastName: newLastName, displayName: newDisplayName }
      });
      console.log('Updated guest ' + g.id + ': lastName=' + newLastName + ', displayName=' + newDisplayName);
    }
    console.log('Updated ' + before.length + ' guest(s)');
  } else {
    console.log('No MBOYO guests found - already fixed');
  }

  // 3. Check + fix venue_time + wedding_time
  const settings = await prisma.settings.findMany({
    where: { key: { in: ['venue_time', 'wedding_time'] } }
  });
  console.log('Current time settings:', JSON.stringify(settings, null, 2));

  const venueTime = settings.find(s => s.key === 'venue_time');
  if (!venueTime) {
    await prisma.settings.create({ data: { key: 'venue_time', value: '21H30' } });
    console.log('Inserted venue_time = 21H30');
  } else if (venueTime.value !== '21H30') {
    await prisma.settings.update({ where: { key: 'venue_time' }, data: { value: '21H30' } });
    console.log('Fixed venue_time: ' + venueTime.value + ' -> 21H30');
  } else {
    console.log('venue_time already correct (21H30)');
  }

  const weddingTime = settings.find(s => s.key === 'wedding_time');
  if (!weddingTime) {
    await prisma.settings.create({ data: { key: 'wedding_time', value: '21:30' } });
    console.log('Inserted wedding_time = 21:30');
  } else if (weddingTime.value !== '21:30') {
    await prisma.settings.update({ where: { key: 'wedding_time' }, data: { value: '21:30' } });
    console.log('Fixed wedding_time: ' + weddingTime.value + ' -> 21:30');
  } else {
    console.log('wedding_time already correct (21:30)');
  }

  // 4. Verify
  const after = await prisma.guest.findMany({
    where: {
      OR: [
        { lastName: { contains: 'MBOYO' } },
        { displayName: { contains: 'MBOYO' } },
      ]
    },
    select: { id: true, firstName: true, lastName: true, displayName: true, invitationType: true }
  });
  console.log('AFTER - MBOYO guests (should be empty):', JSON.stringify(after, null, 2));

  const christGuests = await prisma.guest.findMany({
    where: {
      OR: [
        { lastName: { contains: 'CHRIST MPEPE' } },
        { displayName: { contains: 'CHRIST MPEPE' } },
      ]
    },
    select: { id: true, firstName: true, lastName: true, displayName: true, invitationType: true }
  });
  console.log('AFTER - CHRIST MPEPE guests:', JSON.stringify(christGuests, null, 2));

  const finalTimes = await prisma.settings.findMany({
    where: { key: { in: ['venue_time', 'wedding_time'] } }
  });
  console.log('FINAL time settings:', JSON.stringify(finalTimes, null, 2));

  console.log('=== DB FIX END ===');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
`;

async function main() {
  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve);
    conn.on('error', reject);
    conn.connect(VPS_CONFIG);
  });
  log('✓ SSH connected');

  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => err ? reject(err) : resolve(sftp));
  });

  try {
    // 1. Verify container is up
    log('\n[1] Verify wedding-app is running:');
    await run(conn, 'docker ps --filter "name=wedding-app" --format "{{.Names}}\\t{{.Status}}"');

    // 2. Upload the DB fix script
    log('\n[2] Upload DB fix script (Prisma-based):');
    fs.writeFileSync('/tmp/db-fix-v3.js', DB_FIX_SCRIPT);
    await new Promise((resolve, reject) => {
      sftp.fastPut('/tmp/db-fix-v3.js', '/tmp/db-fix-v3.js', (err) => err ? reject(err) : resolve());
    });
    log('  ✓ Uploaded');

    // 3. Copy into container + run
    log('\n[3] Copy into container + execute (working dir /app for Prisma):');
    await run(conn, 'docker cp /tmp/db-fix-v3.js wedding-app:/app/db-fix-v3.js');
    const fixResult = await run(conn, 'docker exec -w /app wedding-app node db-fix-v3.js 2>&1');
    log(`Fix exit: ${fixResult.code}`);

    // 4. Cleanup
    log('\n[4] Cleanup:');
    await run(conn, 'docker exec wedding-app rm /app/db-fix-v3.js 2>&1');
    await run(conn, 'rm /tmp/db-fix-v3.js 2>&1');

    // 5. Verify via settings API (public endpoint)
    log('\n[5] Verify via public Settings API:');
    await run(conn, 'curl -s https://heureuxmariage.aenews.net/api/settings 2>&1 > /tmp/settings.json && cat /tmp/settings.json | head -300');
    await run(conn, 'grep -o "venue_time[^,]*" /tmp/settings.json 2>&1 || echo "(venue_time not found in API response)"');
    await run(conn, 'grep -o "wedding_time[^,]*" /tmp/settings.json 2>&1 || echo "(wedding_time not found in API response)"');

    log('\n=== DB FIX DEPLOY COMPLETE ===');

  } catch (err) {
    log(`✗ FAILED: ${err.message}`);
    process.exit(1);
  } finally {
    sftp.end();
    conn.end();
  }
}

main().catch(console.error);
