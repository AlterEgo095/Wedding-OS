import { Client } from 'ssh2';
import { readFileSync } from 'fs';

const conn = new Client();
conn.on('ready', () => {
  const files = { 'Dockerfile': '/opt/wedding-platform/Dockerfile', 'docker-entrypoint.sh': '/opt/wedding-platform/docker-entrypoint.sh' };
  const entries = Object.entries(files);
  let i = 0;
  
  function next() {
    if (i >= entries.length) {
      // Make entrypoint executable and start rebuild
      conn.exec(`chmod +x /opt/wedding-platform/docker-entrypoint.sh && nohup bash -c 'cd /opt/wedding-platform && docker compose -f docker-compose.prod.yml build app >> /tmp/wedding-rebuild.log 2>&1 && docker compose -f docker-compose.prod.yml up -d >> /tmp/wedding-rebuild.log 2>&1 && echo REBUILD_COMPLETE >> /tmp/wedding-rebuild.log' &`, (err, stream) => {
        if (err) { console.error(err); }
        stream.on('close', () => { console.log('Rebuild started!'); conn.end(); });
        stream.stderr.on('data', () => {});
      });
      return;
    }
    const [local, remote] = entries[i++];
    const content = readFileSync(local, 'utf8');
    const b64 = Buffer.from(content).toString('base64');
    console.log(`Uploading ${local}...`);
    conn.exec(`echo '${b64}' | base64 -d > "${remote}"`, (err, stream) => {
      if (err) console.error(err);
      stream.on('close', () => { console.log(`  ✓ Done`); next(); });
      stream.stderr.on('data', () => {});
    });
  }
  next();
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 15000 });
