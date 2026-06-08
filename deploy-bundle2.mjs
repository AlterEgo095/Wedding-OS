import { Client } from 'ssh2';
import { readFileSync } from 'fs';

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

function upload(local, remote) {
  return new Promise((resolve) => {
    conn.sftp((err, sftp) => {
      if (err) { resolve(`SFTP_ERR:${err.message}`); return; }
      const ws = sftp.createWriteStream(remote);
      ws.on('close', () => { sftp.end(); resolve('OK'); });
      ws.on('error', (e) => { sftp.end(); resolve(`ERR:${e.message}`); });
      ws.end(readFileSync(local));
    });
  });
}

conn.on('ready', async () => {
  console.log('✅ Connected!');
  
  // Upload bundle 2
  console.log('📤 Uploading bundle 2...');
  const result = await upload('/tmp/src-bundle2.tar.gz', '/tmp/src-bundle2.tar.gz');
  console.log(`Upload: ${result}`);
  
  if (result === 'OK') {
    console.log('📦 Extracting bundle 2...');
    await runCmd(`cd ${DEPLOY_DIR} && tar xzf /tmp/src-bundle2.tar.gz`);
    console.log('✅ Extracted');
    
    // Check rebuild status
    const status = await runCmd('cat /tmp/rebuild-status.txt 2>&1 || echo "STILL_BUILDING"');
    console.log(`Rebuild status: ${status}`);
    
    const log = await runCmd('tail -3 /tmp/rebuild.log 2>&1');
    console.log(`Rebuild log (last 3): ${log.substring(0, 300)}`);
    
    // If first rebuild is done, start a second rebuild with all files
    if (status.includes('DONE')) {
      console.log('First rebuild done! Starting final rebuild with all files...');
      await runCmd(`cd ${DEPLOY_DIR} && nohup bash -c 'docker compose -f docker-compose.prod.yml build --no-cache app && docker compose -f docker-compose.prod.yml up -d && echo "FINAL_DONE" > /tmp/rebuild-final.txt' > /tmp/rebuild-final.log 2>&1 &`);
      console.log('Final rebuild started');
    } else {
      console.log('First rebuild still running. Will need another rebuild after it completes.');
      // Schedule a second rebuild after the first one
      await runCmd(`cd ${DEPLOY_DIR} && nohup bash -c 'while [ ! -f /tmp/rebuild-status.txt ]; do sleep 5; done; sleep 2; docker compose -f docker-compose.prod.yml build --no-cache app && docker compose -f docker-compose.prod.yml up -d && echo "FINAL_DONE" > /tmp/rebuild-final.txt' > /tmp/rebuild-final.log 2>&1 &`);
      console.log('Second rebuild queued (will start after first completes)');
    }
  }
  
  conn.end();
});

conn.on('error', (err) => { console.error('SSH err:', err.message); });
console.log('Connecting...');
conn.connect({ host: VPS_HOST, port: 22, username: VPS_USER, password: VPS_PASS, readyTimeout: 30000 });
