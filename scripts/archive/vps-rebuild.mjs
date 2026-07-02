import { Client } from 'ssh2';

const conn = new Client();
conn.on('ready', async () => {
  console.log('✅ Connected!');
  try {
    // Start the rebuild in background with nohup
    await new Promise((resolve, reject) => {
      conn.exec(`cd /opt/wedding-platform && nohup bash -c 'docker compose -f docker-compose.prod.yml build app 2>&1 | tee /tmp/wedding-build.log && docker compose -f docker-compose.prod.yml up -d 2>&1 | tee -a /tmp/wedding-build.log && echo "BUILD_COMPLETE" >> /tmp/wedding-build.log' > /dev/null 2>&1 &`, (err, stream) => {
        if (err) return reject(err);
        stream.on('close', () => resolve());
      });
    });
    console.log('🔨 Docker rebuild started in background on VPS');
    console.log('   Build log: /tmp/wedding-build.log');
  } catch (err) {
    console.error('Error:', err.message);
  }
  conn.end();
});
conn.on('error', (err) => console.error('SSH error:', err.message));
conn.connect({ host: '95.111.226.63', port: 22, username: 'aenews', password: 'AeNews2025Secure!', readyTimeout: 30000 });
