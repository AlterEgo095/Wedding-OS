// Test full Phase 8 flow on production
const https = require('https');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function main() {
  console.log('=== PHASE 8 PRODUCTION FLOW TEST ===\n');

  // 1. Login
  console.log('1. Login...');
  const loginRes = await fetch('https://heureuxmariage.aenews.net/api/platform/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@josue-hornella.wedding', password: 'admin2026' }),
  });
  const loginData = JSON.parse(loginRes.body);
  const token = loginData.token;
  console.log('   Status:', loginRes.status);
  console.log('   User:', loginData.user.email, '| Role:', loginData.user.role, '| weddingId:', loginData.user.weddingId);
  console.log('   Token:', token ? token.slice(0, 30) + '...' : 'MISSING');

  // 2. Get theme
  console.log('\n2. Get theme...');
  const themeRes = await fetch('https://heureuxmariage.aenews.net/api/theme', {
    headers: { 'X-Wedding-Slug': 'josue-hornella' },
  });
  console.log('   Status:', themeRes.status);
  console.log('   Body:', themeRes.body);

  // 3. Apply romantic-rose template
  console.log('\n3. Apply romantic-rose template...');
  const applyRes = await fetch('https://heureuxmariage.aenews.net/api/theme/apply-template', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'X-Wedding-Slug': 'josue-hornella',
    },
    body: JSON.stringify({ templateId: 'romantic-rose' }),
  });
  console.log('   Status:', applyRes.status);
  console.log('   Body:', applyRes.body);

  // 4. Verify theme changed
  console.log('\n4. Verify theme changed...');
  const themeRes2 = await fetch('https://heureuxmariage.aenews.net/api/theme', {
    headers: { 'X-Wedding-Slug': 'josue-hornella' },
  });
  console.log('   Status:', themeRes2.status);
  console.log('   Body:', themeRes2.body);

  // 5. Reset to classic-gold
  console.log('\n5. Reset to classic-gold...');
  const resetRes = await fetch('https://heureuxmariage.aenews.net/api/theme/apply-template', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'X-Wedding-Slug': 'josue-hornella',
    },
    body: JSON.stringify({ templateId: 'classic-gold' }),
  });
  console.log('   Status:', resetRes.status);
  console.log('   Body:', resetRes.body);

  // 6. Custom domain
  console.log('\n6. Get custom-domain...');
  const domainRes = await fetch('https://heureuxmariage.aenews.net/api/custom-domain', {
    headers: { 'X-Wedding-Slug': 'josue-hornella' },
  });
  console.log('   Status:', domainRes.status);
  console.log('   Body:', domainRes.body);

  console.log('\n=== ALL TESTS COMPLETE ===');
}

main().catch(e => { console.error('FAILED:', e); process.exit(1); });
