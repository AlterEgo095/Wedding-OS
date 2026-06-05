import { Client } from 'ssh2';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

const conn = new Client();

function runCommand(conn, cmd, timeout = 600000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Command timeout')), timeout);
    console.log(`  → ${cmd.substring(0, 100)}...`);
    conn.exec(cmd, (err, stream) => {
      if (err) { clearTimeout(timer); return reject(err); }
      let stdout = '', stderr = '';
      stream.on('data', (data) => { 
        const chunk = data.toString();
        stdout += chunk;
        // Print progress
        if (chunk.includes('Step') || chunk.includes('DONE') || chunk.includes('built') || chunk.includes('Successfully')) {
          process.stdout.write(`  📦 ${chunk.trim()}\n`);
        }
      });
      stream.stderr.on('data', (data) => { 
        stderr += data.toString();
        const chunk = data.toString();
        if (chunk.includes('Step') || chunk.includes('DONE') || chunk.includes('built') || chunk.includes('Successfully') || chunk.includes('WARNING')) {
          process.stdout.write(`  📦 ${chunk.trim()}\n`);
        }
      });
      stream.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected!');
  try {
    console.log('\n🔨 Rebuilding Docker image (this takes a few minutes)...');
    const buildResult = await runCommand(conn, `cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml build --no-cache app 2>&1`);
    console.log(`\n  Build exit code: ${buildResult.code}`);
    
    if (buildResult.code !== 0) {
      console.log('  Build stderr (last 500 chars):', buildResult.stderr.slice(-500));
      // Try without --no-cache for faster build
      console.log('\n🔄 Trying build with cache...');
      const retryResult = await runCommand(conn, `cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml build app 2>&1`);
      console.log(`  Retry exit code: ${retryResult.code}`);
    }
    
    console.log('\n🚀 Restarting container...');
    await runCommand(conn, `cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml up -d 2>&1`);
    
    console.log('\n⏳ Waiting 20s for app to start...');
    await new Promise(r => setTimeout(r, 20000));
    
    console.log('\n🔍 Checking container...');
    await runCommand(conn, `docker ps --filter name=wedding-app --format "{{.Names}}: {{.Status}}"`);
    
    console.log('\n🧪 Testing auto-auth endpoint...');
    await runCommand(conn, `curl -s -X POST http://127.0.0.1:3080/api/guest/auto-auth -H "Content-Type: application/json" -d '{"lookupToken":"test"}' 2>&1`);
    
    console.log('\n🧪 Testing invite endpoint...');
    await runCommand(conn, `curl -s http://127.0.0.1:3080/api/guest/invite?token=test 2>&1`);
    
    console.log('\n✅ Deployment complete!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  conn.end();
});

conn.on('error', (err) => console.error('SSH error:', err.message));
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
