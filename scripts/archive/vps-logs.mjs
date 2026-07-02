import { Client } from 'ssh2';
const conn = new Client();
conn.on('ready', () => {
  // Get the container logs for error details
  conn.exec(`docker logs wedding-app --tail 50 2>&1 | grep -i "error\\|auth\\|auto-auth\\|invite\\|throw\\|fatal\\|warning" | tail -30`, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => out += d);
    stream.on('close', () => { console.log(out); conn.end(); });
  });
});
conn.on('error', e => { console.error('SSH error:', e.message); });
conn.connect({ host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 15000 });
