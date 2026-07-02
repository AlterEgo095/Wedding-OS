import { Client } from 'ssh2';

const VPS_HOST = '95.111.226.63';
const VPS_USER = 'aenews';
const VPS_PASS = 'AeNews2025Secure!';

const conn = new Client();

function runCmd(cmd) {
  return new Promise((resolve) => {
    conn.exec(cmd, (err, stream) => {
      if (err) { resolve(''); return; }
      let out = '';
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => { out += d.toString(); });
      stream.on('close', () => resolve(out.trim()));
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected!');
  
  // Check deploy status
  const status = await runCmd('cat /tmp/deploy-status.txt 2>&1 || echo "NOT_DONE"');
  console.log(`Deploy status: ${status}`);
  
  // Check if rebuild is still running
  const ps = await runCmd('ps aux | grep "docker compose" | grep -v grep | head -3');
  console.log(`Docker processes: ${ps.substring(0, 200)}`);
  
  // Check Docker container
  const docker = await runCmd('docker ps --filter name=wedding-app --format "{{.Names}} {{.Status}} {{.Ports}}"');
  console.log(`Container: ${docker}`);
  
  // Test the site
  const httpCode = await runCmd('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/');
  console.log(`HTTP: ${httpCode}`);
  
  // Check music settings
  const music = await runCmd('curl -s http://127.0.0.1:3080/api/music 2>&1 | head -c 300');
  console.log(`Music API: ${music}`);
  
  // Check effects in container
  const effects = await runCmd('docker exec wedding-app ls /app/.next/server/chunks/ 2>&1 | grep -i effect | head -5 || echo "NO_EFFECTS_CHUNKS"');
  console.log(`Effects chunks: ${effects}`);
  
  // Check if the build log has the deploy status
  const log = await runCmd('tail -5 /tmp/deploy-final.log 2>&1');
  console.log(`Build log (last 5): ${log.substring(0, 400)}`);
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
