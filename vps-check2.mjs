import { Client } from 'ssh2';
const conn = new Client();
conn.on('ready', () => {
  conn.exec(`tail -5 /tmp/rebuild.log 2>/dev/null; echo "---"; docker ps --filter name=wedding --format "{{.ID}} {{.Status}}"`, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = '';
    stream.on('data', d => out += d);
    stream.on('close', () => { console.log(out); conn.end(); });
  });
});
conn.on('error', e => console.error('Error:', e.message));
conn.connect({ host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 10000 });
