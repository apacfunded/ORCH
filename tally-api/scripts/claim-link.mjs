import fs from 'node:fs';
const B = 'https://claimable.neon.tech';
const s = JSON.parse(fs.readFileSync('.neon.json', 'utf8'));
const tok = await (await fetch(B + '/v1/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: s.assertion, resource: B + '/' }) })).json();
const c = await (await fetch(`${B}/v1/projects/${s.project.id}/claim`, { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token } })).json();
console.log('CLAIM', c.verification_uri_complete, 'expires_in', c.expires_in);
