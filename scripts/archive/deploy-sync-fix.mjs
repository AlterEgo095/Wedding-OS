import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

const FILES_TO_UPLOAD = [
  'src/app/api/guests/route.ts',
  'src/app/api/guests/[id]/route.ts',
  'src/lib/guest-utils.ts',
];

const conn = new Client();

function runCmd(cmd, timeout = 30000) {
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

async function uploadB64(localPath, remotePath) {
  const content = readFileSync(localPath, 'utf8');
  const b64 = Buffer.from(content).toString('base64');
  const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
  await runCmd(`mkdir -p "${dir}"`);
  
  if (b64.length <= 55000) {
    await runCmd(`echo '${b64}' | base64 -d > "${remotePath}"`);
  } else {
    await runCmd(`printf '' > "${remotePath}"`);
    for (let i = 0; i < b64.length; i += 55000) {
      const chunk = b64.substring(i, i + 55000);
      await runCmd(`echo '${chunk}' | base64 -d >> "${remotePath}"`);
    }
  }
}

conn.on('ready', async () => {
  console.log('✅ Connected!');
  const t0 = Date.now();
  
  try {
    // Phase 1: Upload files
    console.log('\n📤 Uploading sync fix files...');
    for (const file of FILES_TO_UPLOAD) {
      const localPath = join(process.cwd(), file);
      const remotePath = `${DEPLOY_DIR}/${file}`;
      await uploadB64(localPath, remotePath);
      console.log(`  ✅ ${file}`);
    }

    // Phase 2: Verify
    console.log('\n🔍 Verifying uploads...');
    const c1 = await runCmd(`grep -c "cleanGuestName" ${DEPLOY_DIR}/src/app/api/guests/route.ts`);
    console.log(`  guests/route.ts: ${c1.out.trim()} refs`);
    const c2 = await runCmd(`grep -c "SYNC FIX" ${DEPLOY_DIR}/src/app/api/guests/\\[id\\]/route.ts`);
    console.log(`  guests/[id]/route.ts: ${c2.out.trim()} SYNC FIX markers`);

    // Phase 3: Start Docker rebuild in background
    console.log('\n🔨 Starting Docker rebuild in background...');
    await runCmd(`cd ${DEPLOY_DIR} && rm -f /tmp/wedding-rebuild.status && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app >> /tmp/wedding-rebuild.log 2>&1 && docker compose -f docker-compose.prod.yml up -d >> /tmp/wedding-rebuild.log 2>&1 && echo "DONE $(date)" > /tmp/wedding-rebuild.status' > /dev/null 2>&1 &`);
    console.log('  ✅ Rebuild started in background');

    // Phase 4: Upload and prepare the DB fix script (will run after rebuild)
    console.log('\n🔧 Preparing DB fix script...');
    const fixScript = `
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDisplayNames() {
  const guests = await prisma.guest.findMany({
    select: { id: true, firstName: true, lastName: true, displayName: true, category: true, invitationType: true }
  });
  
  let fixed = 0;
  for (const guest of guests) {
    const parts = [guest.firstName, guest.lastName].filter(Boolean);
    const isCouple = parts.some(p => p.toUpperCase() === 'COUPLE');
    const isFamille = parts.some(p => p.toUpperCase() === 'FAMILLE' || p.toUpperCase() === 'FAMILY');
    const specialPrefixes = ['COUPLE', 'FAMILLE', 'FAMILY'];
    const nameParts = parts.filter(p => !specialPrefixes.includes(p.toUpperCase()));
    
    let correctDisplayName;
    if (isCouple) {
      correctDisplayName = 'Couple ' + nameParts.join(' ');
    } else if (isFamille) {
      correctDisplayName = 'Famille ' + nameParts.join(' ');
    } else {
      const seen = new Set();
      const uniqueParts = parts.filter(part => {
        const upper = part.toUpperCase();
        if (seen.has(upper)) return false;
        seen.add(upper);
        return true;
      });
      correctDisplayName = uniqueParts.join(' ');
    }
    
    if (guest.displayName !== correctDisplayName) {
      await prisma.guest.update({
        where: { id: guest.id },
        data: { displayName: correctDisplayName }
      });
      fixed++;
    }
  }
  
  console.log('Total guests: ' + guests.length + ', Fixed: ' + fixed);
  await prisma.$disconnect();
}

fixDisplayNames().catch(e => { console.error(e); process.exit(1); });
`;
    const fixB64 = Buffer.from(fixScript).toString('base64');
    await runCmd(`echo '${fixB64}' | base64 -d > ${DEPLOY_DIR}/fix-displaynames.js`);
    console.log('  ✅ Fix script uploaded');

    console.log(`\n⏱️ Files uploaded in ${((Date.now()-t0)/1000).toFixed(1)}s`);
    console.log('\n📋 NEXT STEPS:');
    console.log('   1. Wait for Docker rebuild (check: node vps-cmd.mjs "cat /tmp/wedding-rebuild.status 2>/dev/null || echo Still building..."');
    console.log('   2. After rebuild: node vps-cmd.mjs "docker exec wedding-app node /app/fix-displaynames.js"');
    console.log('   3. Verify: node vps-cmd.mjs "curl -s -o /dev/null -w \\"%{http_code}\\" http://localhost:3080/"');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  conn.end();
});

conn.on('error', (err) => console.error('❌ SSH error:', err.message));

console.log('Connecting...');
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
