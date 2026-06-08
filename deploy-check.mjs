import { Client } from 'ssh2';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';
const DEPLOY_DIR = '/opt/wedding-platform';

const conn = new Client();

function runCmd(cmd) {
  return new Promise((resolve) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { resolve(`ERR:${err.message}`); return; }
      let out = '';
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => { out += d.toString(); });
      stream.on('close', () => resolve(out.trim()));
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected!');
  
  // Check full rebuild log
  console.log('📋 Checking rebuild log...');
  const log = await runCmd('cat /tmp/rebuild.log 2>&1 | tail -40');
  console.log(log);
  
  // Check current Docker status
  console.log('\n🐳 Docker status:');
  const docker = await runCmd('docker ps -a --filter name=wedding-app --format "{{.Names}} {{.Status}}"');
  console.log(docker);
  
  // Check if the old container is still running
  console.log('\n🔍 Checking existing container:');
  const existing = await runCmd(`docker exec wedding-app ls /app/src/components/effects/ 2>&1 || echo "CONTAINER_NOT_ACCESSIBLE"`);
  console.log(`Container effects: ${existing.substring(0, 200)}`);
  
  // Try the rebuild again
  console.log('\n🔨 Retrying Docker build...');
  const buildResult = await runCmd(`cd ${DEPLOY_DIR} && docker compose -f docker-compose.prod.yml build --no-cache app 2>&1 | tail -20`);
  console.log(`Build: ${buildResult}`);
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
console.log('Connecting...');
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
