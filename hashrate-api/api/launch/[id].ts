import { wrap, param, clientError } from '../../lib/http';
import { launchStatus } from '../../lib/launches';

export default wrap(async (req, res) => {
  const id = param(req, 'id');
  if (!/^[0-9a-f-]{36}$/.test(id)) throw clientError('Bad launch id.');
  const st = await launchStatus(id);
  if (!st) { res.status(404).json({ error: 'Launch not found.' }); return; }
  return st;
});
