import { Client } from 'ssh2';

const conn = new Client();
const command = process.argv[2] || 'echo hello';

conn.on('ready', () => {
  conn.exec(command, (err, stream) => {
    if (err) { console.error('Exec error:', err); conn.end(); process.exit(1); }
    let stdout = '', stderr = '';
    stream.on('data', (data) => { stdout += data.toString(); });
    stream.stderr.on('data', (data) => { stderr += data.toString(); });
    stream.on('close', () => {
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
      conn.end();
    });
  });
}).connect({
  host: '95.111.226.63',
  port: 22,
  username: 'aenews',
  password: 'AeNews2025Secure!'
});
