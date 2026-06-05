import { Client } from 'ssh2';
const conn = new Client();
conn.on('ready', () => {
  conn.exec(`cat /tmp/wedding-build.log 2>/dev/null | tail -20; echo "---"; docker ps --filter name=wedding-app --format "{{.Names}}: {{.Status}}"`, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => out += d);
    stream.on('close', () => { console.log(out); conn.end(); });
  });
});
conn.on('error', e => { console.error('SSH error:', e.message); });
conn.connect({ host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 15000 });
