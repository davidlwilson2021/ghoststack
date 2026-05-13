// Resend transactional email adapter.
//
// API key is the platform-level RESEND_API_KEY Worker secret; users do
// not need their own Resend account. The FROM address comes from
// RESEND_FROM_EMAIL (falls back to onboarding@resend.dev for sandbox
// testing — that sandbox can only deliver to the email registered on
// the Resend account, so a verified domain is required for real use).

const RESEND_API = 'https://api.resend.com/emails';

export async function sendEmail({ apiKey, from, to, subject, text, replyTo }) {
  if (!apiKey) throw new Error('Resend API key not configured (RESEND_API_KEY)');
  if (!from) throw new Error('Resend FROM address not configured (RESEND_FROM_EMAIL)');
  if (!Array.isArray(to) || to.length === 0) throw new Error('to must be a non-empty array');
  if (!subject || typeof subject !== 'string') throw new Error('subject is required');

  const payload = { from, to, subject, text };
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || data.error || data.message) {
    const msg = data?.error?.message || data?.message || `Resend error (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return { id: data.id, raw: data };
}
