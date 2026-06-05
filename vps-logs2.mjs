import { Client } from 'ssh2';
const conn = new Client();
conn.on('ready', () => {
  const cmds = [
    `docker ps -a --filter name=wedding --format "{{.ID}} {{.Names}} {{.Status}}"`,
    `docker logs $(docker ps -q --filter name=wedding) --tail 80 2>&1`,
  ];
  let i = 0;
  function next() {
    if (i >= cmds.length) { conn.end(); return; }
    conn.exec(cmds[i++], (err, stream) => {
      if (err) { console.error(err); next(); return; }
      let out = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => out += d);
      stream.on('close', () => { console.log(out.substring(0, 3000)); next(); });
    });
  }
  next();
});
conn.on('error', e => { console.error('SSH error:', e.message); });
conn.connect({ host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 15000 });
