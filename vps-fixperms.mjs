import { Client } from 'ssh2';
const conn = new Client();
conn.on('ready', () => {
  const cmds = [
    // Fix DB ownership - run as root inside the container
    `docker exec -u root $(docker ps -q --filter name=wedding) chown nextjs:nodejs /app/db/custom.db 2>&1`,
    // Fix DB permissions
    `docker exec -u root $(docker ps -q --filter name=wedding) chmod 660 /app/db/custom.db 2>&1`,
    // Also fix the db directory itself
    `docker exec -u root $(docker ps -q --filter name=wedding) chown nextjs:nodejs /app/db 2>&1`,
    `docker exec -u root $(docker ps -q --filter name=wedding) chmod 770 /app/db 2>&1`,
    // Verify permissions
    `docker exec $(docker ps -q --filter name=wedding) ls -la /app/db/ 2>&1`,
    // Test writing to the DB
    `docker exec $(docker ps -q --filter name=wedding) sh -c 'echo "test" > /app/db/.write_test && rm /app/db/.write_test && echo "WRITE OK"' 2>&1`,
  ];
  let i = 0;
  function next() {
    if (i >= cmds.length) { conn.end(); return; }
    conn.exec(cmds[i++], (err, stream) => {
      if (err) { console.error(err); next(); return; }
      let out = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => out += d);
      stream.on('close', () => { console.log(out.trim()); next(); });
    });
  }
  next();
});
conn.on('error', e => { console.error('SSH error:', e.message); });
conn.connect({ host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 15000 });
