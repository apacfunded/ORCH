// Creates a claimable Neon Postgres (expires in 72h unless claimed). Saves secrets to ./.neon.json
import fs from 'node:fs';
const B = 'https://claimable.neon.tech';
const id = await (await fetch(B + '/v1/agent/identity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'anonymous', capabilities: ['postgres'], source: 'tally-markets', region_id: 'aws-us-east-1' }) })).json();
if (!id.identity_assertion) { console.log('identity failed', JSON.stringify(id).slice(0, 400)); process.exit(1); }
const tok = await (await fetch(B + '/v1/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: id.identity_assertion, resource: B + '/' }) })).json();
const cred = await (await fetch(`${B}/v1/projects/${id.project.id}/credentials`, { headers: { Authorization: 'Bearer ' + tok.access_token } })).json();
fs.writeFileSync('.neon.json', JSON.stringify({ project: id.project, assertion: id.identity_assertion, database_url: cred.database_url }, null, 2));
console.log('project', id.project.id, 'region', id.project.region_id, 'expires', id.project.expires_at, 'has_url', !!cred.database_url);
