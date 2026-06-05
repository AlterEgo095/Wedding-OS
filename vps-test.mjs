import { Client } from 'ssh2';
const conn = new Client();
conn.on('ready', () => {
  const cmds = [
    `docker ps --filter name=wedding-app --format "{{.Names}}: {{.Status}}"`,
    `curl -s -X POST http://127.0.0.1:3080/api/guest/auto-auth -H "Content-Type: application/json" -d '{"lookupToken":"test"}'`,
    `curl -s http://127.0.0.1:3080/api/guest/invite?token=test`,
    `curl -s "http://127.0.0.1:3080/api/guest/lookup?q=MATANDA" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Results:', d.get('total')); print('First:', d['results'][0]['name'] if d.get('results') else 'None')" 2>/dev/null || curl -s "http://127.0.0.1:3080/api/guest/lookup?q=MATANDA" | head -c 200`,
  ];
  
  let i = 0;
  function next() {
    if (i >= cmds.length) { conn.end(); return; }
    const cmd = cmds[i++];
    console.log(`\n🧪 Test ${i}: ${cmd.substring(0, 80)}...`);
    conn.exec(cmd, (err, stream) => {
      if (err) { console.error('Error:', err); next(); return; }
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
