import { decrypt } from './crypto.js';

export async function resolveSlackBotToken(env, db, userId) {
  if (env.SLACK_BOT_TOKEN) {
    return { token: env.SLACK_BOT_TOKEN, source: 'platform' };
  }
  if (!env.MASTER_KEY || !db || !userId) return null;
  const row = await db
    .prepare(
      `SELECT slack_bot_token_encrypted, slack_bot_token_iv
       FROM user_settings WHERE user_id = ?`
    )
    .bind(userId)
    .first();
  if (!row?.slack_bot_token_encrypted || !row?.slack_bot_token_iv) return null;
  try {
    const token = await decrypt(
      row.slack_bot_token_encrypted,
      row.slack_bot_token_iv,
      env.MASTER_KEY
    );
    return { token, source: 'user_settings' };
  } catch {
    return null;
  }
}
