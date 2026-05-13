export async function getSession(db, request) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const row = await db.prepare(
    `SELECT s.*, u.email, u.display_name, u.role, u.status
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.token = ? AND s.expires_at > datetime('now')`
  ).bind(token).first();
  if (!row || row.status !== 'approved') return null;
  return row;
}
