import { handler, send, endSession } from '../../lib/http.js';

// POST /api/auth/logout: clears the session cookie
export default handler(['POST'], async (req, res) => {
  endSession(req, res);
  send(res, 200, { ok: true });
});
