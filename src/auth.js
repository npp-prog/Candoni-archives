const crypto = require('node:crypto');
const { db } = require('./db');

const SESSION_HOURS = 12;
const COOKIE = 'ca_session';

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(pw, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
}

function ensureAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;
  const pw = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users (username, full_name, role, password_hash, must_change_password) VALUES (?,?,?,?,1)').run(
    'admin', 'Administrator', 'admin', hashPassword(pw),
  );
  console.log(`Created default user "admin" with password "${pw}". Change it after first login.`);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, expires);
  return token;
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// Attaches req.user when a valid session cookie is present.
function sessionMiddleware(req, _res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const row = db.prepare(
      `SELECT u.id, u.username, u.full_name, u.role, u.must_change_password, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.active = 1`,
    ).get(token);
    if (row && row.expires_at > new Date().toISOString()) {
      req.user = row;
      req.sessionToken = token;
    }
  }
  next();
}

const RANK = { viewer: 1, officer: 2, admin: 3 };

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in.' });
    if (RANK[req.user.role] < RANK[role]) return res.status(403).json({ error: 'You do not have permission to do this.' });
    next();
  };
}

function setCookie(res, token, secure) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${token ? SESSION_HOURS * 3600 : 0}`];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

module.exports = { hashPassword, verifyPassword, ensureAdmin, createSession, sessionMiddleware, requireRole, setCookie };
