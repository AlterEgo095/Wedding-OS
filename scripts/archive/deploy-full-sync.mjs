import { Client } from 'ssh2';
import { readFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, dirname, relative } from 'path';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';
const PROJECT_DIR = '/home/z/my-project';

// Collect all files to upload
function collectFiles(dir, patterns = []) {
  const files = [];
  const skipDirs = ['node_modules', '.next', '.git', 'db', 'upload', 'download', '3000', 'mini-services', 'agent-ctx', 'examples', 'scripts', 'nginx'];
  const skipFiles = ['.png', '.jpg', '.jpeg', '.webp', '.ico', '.db', '.lock', '.deb'];
  
  function walk(d) {
    try {
      const items = readdirSync(d);
      for (const item of items) {
        const fullPath = join(d, item);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            if (!skipDirs.includes(item) && !item.startsWith('.')) {
              walk(fullPath);
            }
          } else if (stat.isFile()) {
            const ext = item.substring(item.lastIndexOf('.')).toLowerCase();
            // Skip binary/image files but include .svg
            if (skipFiles.includes(ext) && ext !== '.svg') continue;
            // Skip large files
            if (stat.size > 500000) continue;
            // Skip log files
            if (item.endsWith('.log') || item.endsWith('.txt')) continue;
            
            const relPath = relative(PROJECT_DIR, fullPath);
            files.push(relPath);
          }
        } catch (e) { /* skip */ }
      }
    } catch (e) { /* skip */ }
  }
  
  walk(dir);
  return files;
}

const conn = new Client();

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    console.log(`  → ${cmd.substring(0, 100)}${cmd.length > 100 ? '...' : ''}`);
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '', stderr = '';
      stream.on('data', (data) => { stdout += data.toString(); });
      stream.stderr.on('data', (data) => { stderr += data.toString(); });
      stream.on('close', (code) => {
        if (stdout.trim()) console.log(`  ✓ ${stdout.trim().substring(0, 200)}`);
        if (stderr.trim() && !stderr.includes('WARNING')) console.log(`  ⚠ ${stderr.trim().substring(0, 200)}`);
        resolve({ code, stdout, stderr });
      });
    });
  });
}

function uploadFile(localPath, remotePath) {
  return new Promise((resolve, reject) => {
    const content = readFileSync(localPath);
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const stream = sftp.createWriteStream(remotePath);
      stream.on('close', () => { resolve(); });
      stream.on('error', reject);
      stream.end(content);
    });
  });
}

function ensureDir(remoteDir) {
  return runCommand(`mkdir -p ${remoteDir}`);
}

conn.on('ready', async () => {
  console.log('✅ Connected to VPS!');
  
  try {
    // Step 1: Collect all source files
    console.log('\n📦 Step 1: Collecting source files...');
    const files = collectFiles(join(PROJECT_DIR, 'src'));
    const publicFiles = collectFiles(join(PROJECT_DIR, 'public'));
    const rootFiles = [
      'package.json', 'next.config.ts', 'tsconfig.json', 'tailwind.config.ts',
      'postcss.config.mjs', 'eslint.config.mjs', 'components.json',
      'docker-compose.prod.yml', 'Dockerfile', 'docker-entrypoint.sh',
      'prisma/schema.prisma', 'prisma/seed.ts',
    ].filter(f => existsSync(join(PROJECT_DIR, f)));
    
    const allFiles = [
      ...files.map(f => join('src', f)),
      ...publicFiles.map(f => join('public', f)),
      ...rootFiles,
    ];
    
    console.log(`  Found ${allFiles.length} files to sync`);
    
    // Step 2: Create necessary directories on VPS
    console.log('\n📁 Step 2: Creating directories on VPS...');
    const dirs = new Set();
    for (const file of allFiles) {
      const dir = dirname(file);
      dirs.add(dir);
      // Add parent directories
      let parent = dir;
      while (parent !== '.') {
        dirs.add(parent);
        parent = dirname(parent);
      }
    }
    for (const dir of dirs) {
      await ensureDir(`${DEPLOY_DIR}/${dir}`);
    }
    
    // Step 3: Upload all files
    console.log('\n📤 Step 3: Uploading files...');
    let uploaded = 0;
    let failed = 0;
    for (const file of allFiles) {
      try {
        const localPath = join(PROJECT_DIR, file);
        const remotePath = `${DEPLOY_DIR}/${file}`;
        if (existsSync(localPath)) {
          await uploadFile(localPath, remotePath);
          uploaded++;
          if (uploaded % 20 === 0) console.log(`  → ${uploaded}/${allFiles.length} files uploaded...`);
        }
      } catch (e) {
        failed++;
        if (failed <= 5) console.log(`  ❌ Failed: ${file} - ${e.message}`);
      }
    }
    console.log(`  ✅ Uploaded: ${uploaded}, Failed: ${failed}`);
    
    // Step 4: Install dependencies
    console.log('\n📦 Step 4: Installing dependencies...');
    await runCommand(`cd ${DEPLOY_DIR} && npm install --production=false 2>&1 | tail -5`);
    
    // Step 5: Rebuild Docker image
    console.log('\n🔨 Step 5: Rebuilding Docker image...');
    await runCommand(`cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 | tail -30`);
    
    // Step 6: Restart container
    console.log('\n🚀 Step 6: Restarting container...');
    await runCommand(`cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml up -d 2>&1`);
    
    // Step 7: Wait and verify
    console.log('\n⏳ Step 7: Waiting for container to start...');
    await new Promise(r => setTimeout(r, 20000));
    
    console.log('\n🔍 Step 8: Checking container status...');
    await runCommand(`docker ps --filter name=wedding-app --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"`);
    
    console.log('\n🧪 Step 9: Testing site...');
    await runCommand(`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/`);
    await runCommand(`curl -s http://127.0.0.1:3080/api/settings | head -c 200`);
    await runCommand(`curl -s http://127.0.0.1:3080/api/music | head -c 200`);
    
    console.log('\n✅ Deployment complete!');
  } catch (err) {
    console.error('❌ Deployment error:', err);
  }
  
  conn.end();
});

conn.on('error', (err) => {
  console.error('❌ SSH connection error:', err.message);
});

console.log(`Connecting to ${VPS_USER}@${VPS_HOST}...`);
conn.connect({
  host: VPS_HOST,
  port: 22,
  username: VPS_USER,
  password: VPS_PASS,
  readyTimeout: 60000,
});
