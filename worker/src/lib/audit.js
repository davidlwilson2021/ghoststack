// Audit log writer.
//
// Records sensitive events to the audit_log table. The principle:
// log enough to investigate an incident (who, when, what, from where),
// but NEVER log secrets or content. Specifically:
//   - DO log: email, action name, IDs, counts, status
//   - DON'T log: passwords, API keys, full task text, full EOD bodies
//
// The user_id is nullable because some events (failed login on a
// non-existent account, registration of a brand-new account) have no
// authenticated user at the time of the event.
//
// All writes are awaited — they're cheap (one INSERT) and ensure the
// log is durable before the response goes out.

export async function logAudit(env, request, { user_id, action, details }) {
  try {
    const ip = request?.headers?.get('CF-Connecting-IP') || null;
    const ua = request?.headers?.get('User-Agent') || null;
    const detailsJson = details ? JSON.stringify(details) : null;
    await env.DB.prepare(
      `INSERT INTO audit_log (user_id, action, details, ip, user_agent)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      user_id ?? null,
      action,
      detailsJson,
      ip,
      ua,
    ).run();
  } catch (e) {
    // Audit logging must never break the request path. Surface the
    // failure to Worker logs but don't throw.
    console.warn('audit_log write failed:', e?.message || e);
  }
}
