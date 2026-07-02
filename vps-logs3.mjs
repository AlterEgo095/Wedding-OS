import { Client } from 'ssh2';
const conn = new Client();
conn.on('ready', () => {
  conn.exec(`docker logs $(docker ps -q --filter name=wedding) --tail 30 2>&1`, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    let out = '';
    stream.on('data', d => out += d);
    stream.stderr.on('data', d => out += d);
    stream.on('close', () => { console.log(out.substring(0, 4000)); conn.end(); });
  });
});
conn.on('error', e => { console.error('SSH error:', e.message); });
conn.connect({ host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 15000 });
