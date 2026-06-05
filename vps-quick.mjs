import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const conn = new Client();
let done = false;
const timer = setTimeout(() => { if (!done) { console.log('Timeout - exiting'); process.exit(0); } }, 20000);

conn.on('ready', () => {
  // Upload Dockerfile via base64
  const df = readFileSync('/home/z/my-project/Dockerfile', 'utf8');
  const ep = readFileSync('/home/z/my-project/docker-entrypoint.sh', 'utf8');
  const dfB64 = Buffer.from(df).toString('base64');
  const epB64 = Buffer.from(ep).toString('base64');
  
  const cmd = `echo '${dfB64}' | base64 -d > /opt/wedding-platform/Dockerfile && echo '${epB64}' | base64 -d > /opt/wedding-platform/docker-entrypoint.sh && chmod +x /opt/wedding-platform/docker-entrypoint.sh && echo UPLOAD_OK && nohup bash -c 'cd /opt/wedding-platform && docker compose -f docker-compose.prod.yml build app >> /tmp/rebuild.log 2>&1 && docker compose -f docker-compose.prod.yml up -d >> /tmp/rebuild.log 2>&1 && echo DONE >> /tmp/rebuild.log' &>/dev/null &`;
  
  conn.exec(cmd, (err, stream) => {
    if (err) console.error(err);
    let out = '';
    stream.on('data', d => out += d);
    stream.on('close', () => {
      console.log('Output:', out.trim());
      done = true;
      clearTimeout(timer);
      conn.end();
    });
  });
});
conn.on('error', e => { console.error('Error:', e.message); done = true; clearTimeout(timer); });
conn.connect({ host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 10000 });
