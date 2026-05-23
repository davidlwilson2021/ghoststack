// GhostStack Worker — entry point and router.
//
// Routes are split into modules under routes/. Cross-cutting concerns
// (CORS, sessions, crypto, validation, admin seeding) live in lib/.
// This file is intentionally thin: dispatch by path + method, nothing
// else.

import { corsHeaders, err, json } from './lib/cors.js';
import { seedAdmin } from './lib/seed.js';
import { BUILD_ID } from './lib/build.js';
import * as auth from './routes/auth.js';
import * as admin from './routes/admin.js';
import * as settings from './routes/settings.js';
import * as tasks from './routes/tasks.js';
import * as eod from './routes/eod.js';
import * as proxy from './routes/proxy.js';

// Module-scope flag — survives across requests within the same isolate.
// Ensures seedAdmin() runs at most once per cold start instead of on
// every incoming request.
let adminSeeded = false;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (!adminSeeded) {
      await seedAdmin(env.DB, env);
      adminSeeded = true;
    }

    if (path === '/health' && method === 'GET') {
      return json({
        ok: true,
        build: BUILD_ID,
        hasSlackToken: !!env.SLACK_BOT_TOKEN,
        hasMasterKey: !!env.MASTER_KEY,
        slackLogChannel: env.SLACK_LOG_CHANNEL || null,
      }, 200, request);
    }

    if (path === '/version' && method === 'GET') {
      return json({
        ok: true,
        build: BUILD_ID,
        features: { serverSlackMirror: true },
      }, 200, request);
    }

    // ── Auth routes ──
    if (path === '/auth/register' && method === 'POST') return auth.register(request, env);
    if (path === '/auth/login' && method === 'POST') return auth.login(request, env);
    if (path === '/auth/session' && method === 'GET') return auth.session(request, env);
    if (path === '/auth/logout' && method === 'POST') return auth.logout(request, env);
    if (path === '/auth/change-password' && method === 'POST') return auth.changePassword(request, env);

    // ── Admin routes ──
    if (path === '/admin/users' && method === 'GET') return admin.listUsers(request, env);
    if (path === '/admin/approve' && method === 'POST') return admin.approve(request, env);
    if (path === '/admin/deny' && method === 'POST') return admin.deny(request, env);
    if (path === '/admin/suspend' && method === 'POST') return admin.suspend(request, env);
    if (path === '/admin/delete' && method === 'POST') return admin.deleteUser(request, env);

    // ── Admin Monitor routes (Phase 2) ──
    if (path === '/admin/audit-log' && method === 'GET') return admin.listAuditLog(request, env);
    if (path === '/admin/all-tasks' && method === 'GET') return admin.listAllTasks(request, env);
    if (path === '/admin/eod-history' && method === 'GET') return admin.listEodHistory(request, env);
    if (path === '/admin/user-activity' && method === 'GET') return admin.getUserActivity(request, env);
    if (path === '/admin/slack-status' && method === 'GET') return admin.slackStatus(request, env);

    // ── Settings routes (Phase 2) ──
    if (path === '/settings' && method === 'GET') return settings.getSettings(request, env);
    if (path === '/settings' && method === 'POST') return settings.updateSettings(request, env);

    // ── Tasks routes (Phase 2) ──
    if (path === '/tasks' && method === 'POST') return tasks.createTask(request, env);
    if (path === '/tasks' && method === 'GET') return tasks.listTasks(request, env);
    const taskIdMatch = path.match(/^\/tasks\/(\d+)$/);
    if (taskIdMatch && method === 'DELETE') return tasks.deleteTask(request, env, parseInt(taskIdMatch[1], 10));

    // ── EOD routes (Phase 2) ──
    if (path === '/eod/generate' && method === 'POST') return eod.generateEod(request, env);
    if (path === '/eod/send' && method === 'POST') return eod.sendEod(request, env);

    // ── Phase 1 legacy proxy routes (kept for backward compatibility) ──
    if (path === '/log' && method === 'POST') return proxy.logToSlack(request, env);
    if (path === '/history') return proxy.fetchHistory(request, env);
    if (path === '/claude' && method === 'POST') return proxy.callClaude(request, env);

    return err('Not found', 404, request);
  },

  // Runs on the cron schedule defined in wrangler.toml.
  // Purges expired sessions so the sessions table doesn't grow unbounded.
  // Active sessions are unaffected — the WHERE clause only targets rows
  // whose expires_at is already in the past.
  async scheduled(_event, env) {
    try {
      const result = await env.DB.prepare(
        "DELETE FROM sessions WHERE expires_at < datetime('now')"
      ).run();
      console.log(`session cleanup: removed ${result.meta?.changes ?? 0} expired rows`);
    } catch (e) {
      console.error('session cleanup failed:', e?.message);
    }
  },
};
