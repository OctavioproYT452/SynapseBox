// Tablas, columnas añadidas con el tiempo y UUID permanente por usuario.
module.exports = function createSchema(db) {
  db.exec(`
  PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE NOT NULL, password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0, suspended INTEGER DEFAULT 0, max_space_mb REAL DEFAULT 100,
    used_bytes INTEGER DEFAULT 0, used_at INTEGER DEFAULT 0, created_at INTEGER, last_login INTEGER, last_ip TEXT, theme TEXT, uuid TEXT);
  CREATE TABLE IF NOT EXISTS sessions(
    token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER, expires_at INTEGER, ip TEXT, ua TEXT);
  CREATE TABLE IF NOT EXISTS shares(
    token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    path TEXT, is_dir INTEGER, expires_at INTEGER, created_at INTEGER, pw TEXT);
  DROP TABLE IF EXISTS logs;
  CREATE TABLE IF NOT EXISTS favs(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, path TEXT, PRIMARY KEY(user_id,path));
  CREATE TABLE IF NOT EXISTS user_themes(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, name TEXT, data TEXT, public INTEGER DEFAULT 0, PRIMARY KEY(user_id,name));
  CREATE TABLE IF NOT EXISTS collabs(
    id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, path TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER,
    UNIQUE(owner_id, path, user_id));
  CREATE INDEX IF NOT EXISTS collabs_user ON collabs(user_id);
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS ai_usage(user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, ts INTEGER);
  CREATE INDEX IF NOT EXISTS ai_usage_idx ON ai_usage(user_id, ts);
  CREATE TABLE IF NOT EXISTS recovery_codes(hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, used INTEGER DEFAULT 0, created_at INTEGER);
  CREATE INDEX IF NOT EXISTS recovery_user ON recovery_codes(user_id);
  CREATE TABLE IF NOT EXISTS discord_links(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, discord_id TEXT NOT NULL UNIQUE, discord_name TEXT, linked_at INTEGER);
  CREATE TABLE IF NOT EXISTS discord_ticket_cfg(guild_id TEXT PRIMARY KEY, role_id TEXT NOT NULL, category_id TEXT, log_id TEXT, max_open INTEGER NOT NULL DEFAULT 1, counter INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS discord_tickets(channel_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, number INTEGER NOT NULL, claimed_by TEXT, subject TEXT, created INTEGER);
  CREATE INDEX IF NOT EXISTS discord_tickets_user ON discord_tickets(guild_id, user_id);
  CREATE TABLE IF NOT EXISTS trash(id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, orig TEXT NOT NULL, is_dir INTEGER NOT NULL DEFAULT 0, size INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER NOT NULL, deleted_by TEXT);
  CREATE INDEX IF NOT EXISTS trash_user ON trash(user_id, deleted_at);
  CREATE TABLE IF NOT EXISTS discord_vars(scope TEXT NOT NULL, key TEXT NOT NULL, name TEXT NOT NULL, value TEXT, PRIMARY KEY(scope,key,name));
  CREATE TABLE IF NOT EXISTS discord_welcome(guild_id TEXT PRIMARY KEY, enabled INTEGER DEFAULT 0, channel_id TEXT, message TEXT, title TEXT, embed INTEGER DEFAULT 1, updated_at INTEGER, role_id TEXT);
  CREATE TABLE IF NOT EXISTS ad_sessions(token TEXT PRIMARY KEY, key TEXT NOT NULL, scope TEXT NOT NULL, created INTEGER NOT NULL, opened INTEGER, short TEXT, done INTEGER DEFAULT 0);
  CREATE INDEX IF NOT EXISTS ad_sessions_key ON ad_sessions(key, done);
  CREATE TABLE IF NOT EXISTS ad_log(key TEXT NOT NULL, scope TEXT NOT NULL, ts INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS ad_log_key ON ad_log(key, ts);
  CREATE TABLE IF NOT EXISTS ad_credits(key TEXT NOT NULL, scope TEXT NOT NULL, uses INTEGER NOT NULL DEFAULT 0, until INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(key,scope));
  CREATE TABLE IF NOT EXISTS disks(id INTEGER PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'internal', accepting INTEGER NOT NULL DEFAULT 1, max_gb REAL NOT NULL DEFAULT 0, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS audit(ts INTEGER NOT NULL, user TEXT, action TEXT, detail TEXT, ip TEXT);
  CREATE INDEX IF NOT EXISTS audit_ts ON audit(ts);
  INSERT OR IGNORE INTO disks(id,name,path,kind,accepting,max_gb,created_at) VALUES(1,'Principal','','internal',1,0,0);
  INSERT OR IGNORE INTO settings VALUES('allow_registration','1'),('default_quota_mb','100');
  `);

  for (const q of ["ALTER TABLE users ADD COLUMN theme TEXT", "ALTER TABLE shares ADD COLUMN pw TEXT", "ALTER TABLE user_themes ADD COLUMN public INTEGER DEFAULT 0", "ALTER TABLE users ADD COLUMN uuid TEXT", "ALTER TABLE users ADD COLUMN ai_limit INTEGER", "ALTER TABLE users ADD COLUMN ai_period TEXT", "ALTER TABLE users ADD COLUMN totp_secret TEXT", "ALTER TABLE users ADD COLUMN totp_pending TEXT", "ALTER TABLE users ADD COLUMN totp_on INTEGER DEFAULT 0", "ALTER TABLE users ADD COLUMN totp_last INTEGER DEFAULT 0", "ALTER TABLE users ADD COLUMN dav_on INTEGER DEFAULT 0", "ALTER TABLE users ADD COLUMN dav_hash TEXT", "ALTER TABLE users ADD COLUMN dav_at INTEGER", "ALTER TABLE discord_welcome ADD COLUMN role_id TEXT", "ALTER TABLE users ADD COLUMN disk_id INTEGER"]) try { db.exec(q); } catch { }

  // UUID permanente por usuario (v4). Se genera solo al crear la cuenta y nunca cambia.
  const UUID = "lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))";
  db.exec(`UPDATE users SET uuid=${UUID} WHERE uuid IS NULL OR uuid='';
  CREATE UNIQUE INDEX IF NOT EXISTS users_uuid ON users(uuid);
  CREATE TRIGGER IF NOT EXISTS users_uuid_ai AFTER INSERT ON users WHEN NEW.uuid IS NULL BEGIN UPDATE users SET uuid=${UUID} WHERE id=NEW.id; END;`);
};
