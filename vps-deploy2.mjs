import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { join } from 'path';

const conn = new Client();
conn.on('ready', async () => {
  console.log('✅ Connected!');
  try {
    const files = [
      'Dockerfile',
      'docker-entrypoint.sh',
    ];
    
    for (const file of files) {
      const localPath = join(process.cwd(), file);
      const remotePath = `/opt/wedding-platform/${file}`;
      const content = readFileSync(localPath, 'utf8');
      const b64 = Buffer.from(content).toString('base64');
      console.log(`Uploading ${file}...`);
      await new Promise((resolve, reject) => {
        conn.exec(`echo '${b64}' | base64 -d > "${remotePath}"`, (err, stream) => {
          if (err) return reject(err);
          stream.on('close', () => { console.log(`  ✓ ${file} uploaded`); resolve(); });
          stream.stderr.on('data', d => { if (d.toString().trim()) console.log(`  ⚠ ${d.toString().trim()}`); });
        });
      });
    }
    
    // Make entrypoint executable
    await new Promise((resolve, reject) => {
      conn.exec(`chmod +x /opt/wedding-platform/docker-entrypoint.sh`, (err, stream) => {
        if (err) return reject(err);
        stream.on('close', () => resolve());
      });
    });
    
    // Start the rebuild in background
    console.log('\nStarting Docker rebuild in background...');
    await new Promise((resolve, reject) => {
      conn.exec(`nohup bash -c 'cd /opt/wedding-platform && docker compose -f docker-compose.prod.yml build app 2>&1 | tee /tmp/wedding-rebuild.log && docker compose -f docker-compose.prod.yml up -d 2>&1 | tee -a /tmp/wedding-rebuild.log && echo "REBUILD_COMPLETE" >> /tmp/wedding-rebuild.log' > /dev/null 2>&1 &`, (err, stream) => {
        if (err) return reject(err);
        stream.on('close', () => { console.log('  ✓ Rebuild started'); resolve(); });
      });
    });
    
    console.log('\n✅ Files uploaded and rebuild started!');
    console.log('   Check progress: node vps-check.mjs');
  } catch (err) {
    console.error('Error:', err.message);
  }
  conn.end();
});
conn.on('error', e => console.error('SSH error:', e.message));
conn.connect({ host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 15000 });
