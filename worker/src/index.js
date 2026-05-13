// GhostStack Worker — entry point and router.
//
// Routes are split into modules under routes/. Cross-cutting concerns
// (CORS, sessions, crypto, validation, admin seeding) live in lib/.
// This file is intentionally thin: dispatch by path + method, nothing
// else.

import { corsHeaders, err } from './lib/cors.js';
import { seedAdmin } from './lib/seed.js';
import * as auth from './routes/auth.js';
import * as admin from './routes/admin.js';
import * as settings from './routes/settings.js';
import * as tasks from './routes/tasks.js';
import * as proxy from './routes/proxy.js';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    await seedAdmin(env.DB, env);

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
    if (path === '/admin/delete' && method === 'POST') return admin.deleteUser(request, env);

    // ── Settings routes (Phase 2) ──
    if (path === '/settings' && method === 'GET') return settings.getSettings(request, env);
    if (path === '/settings' && method === 'POST') return settings.updateSettings(request, env);

    // ── Tasks routes (Phase 2) ──
    if (path === '/tasks' && method === 'POST') return tasks.createTask(request, env);
    if (path === '/tasks' && method === 'GET') return tasks.listTasks(request, env);
    const taskIdMatch = path.match(/^\/tasks\/(\d+)$/);
    if (taskIdMatch && method === 'DELETE') return tasks.deleteTask(request, env, parseInt(taskIdMatch[1], 10));

    // ── Phase 1 legacy proxy routes (kept for backward compatibility) ──
    if (path === '/log' && method === 'POST') return proxy.logToSlack(request, env);
    if (path === '/history') return proxy.fetchHistory(request, env);
    if (path === '/claude' && method === 'POST') return proxy.callClaude(request, env);

    return err('Not found', 404, request);
  },
};
