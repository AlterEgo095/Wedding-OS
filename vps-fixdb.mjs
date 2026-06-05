import { Client } from 'ssh2';
const conn = new Client();
conn.on('ready', () => {
  const cmds = [
    // Check current DB file permissions
    `docker exec $(docker ps -q --filter name=wedding) ls -la /app/db/ 2>&1`,
    // Check who the process runs as
    `docker exec $(docker ps -q --filter name=wedding) whoami 2>&1`,
    // Check the volume mount
    `docker inspect $(docker ps -q --filter name=wedding) --format='{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}} ({{.RW}}){{"\\n"}}{{end}}' 2>&1`,
  ];
  let i = 0;
  function next() {
    if (i >= cmds.length) { conn.end(); return; }
    conn.exec(cmds[i++], (err, stream) => {
      if (err) { console.error(err); next(); return; }
      let out = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => out += d);
      stream.on('close', () => { console.log(out); next(); });
    });
  }
  next();
});
conn.on('error', e => { console.error('SSH error:', e.message); });
conn.connect({ host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 15000 });
