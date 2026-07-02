import { Client } from 'ssh2';
const conn = new Client();
conn.on('ready', () => {
  const cmds = [
    `cd /opt/wedding-platform && docker compose -f docker-compose.prod.yml restart 2>&1`,
    `sleep 10 && docker ps --filter name=wedding-app --format "{{.Names}}: {{.Status}}"`,
    `docker exec $(docker ps -q --filter name=wedding) ls -la /app/db/ 2>&1`,
    `curl -s "http://127.0.0.1:3080/api/guest/lookup?q=MATANDA" | head -c 100`,
    `curl -s -X POST http://127.0.0.1:3080/api/guest/auto-auth -H "Content-Type: application/json" -d '{"lookupToken":"test"}'`,
  ];
  let i = 0;
  function next() {
    if (i >= cmds.length) { conn.end(); return; }
    console.log(`\nStep ${i+1}...`);
    conn.exec(cmds[i++], (err, stream) => {
      if (err) { console.error(err); next(); return; }
      let out = '';
      stream.on('data', d => out += d);
      stream.stderr.on('data', d => out += d);
      stream.on('close', () => { console.log(out.trim().substring(0, 500)); next(); });
    });
  }
  next();
});
conn.on('error', e => { console.error('SSH error:', e.message); });
conn.connect({ host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 15000 });
