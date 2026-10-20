import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * The database: SQLite through Node's built-in driver, so the site runs with
 * no database server to install. The schema follows spec §16 table for table;
 * moving to Postgres for national scale is a change of driver, not of design
 * (every query here is plain SQL with named parameters).
 *
 * Phone numbers and emails are never stored in clear: *_enc holds the sealed
 * value and *_hash a keyed hash for lookups (see lib/crypto.js).
 */

const DB_FILE = process.env.DATABASE_FILE ?? path.join(process.cwd(), "data", "adc.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone_enc TEXT NOT NULL,
  phone_hash TEXT NOT NULL UNIQUE,
  email_enc TEXT,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  volunteer_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_signin_at TEXT
);

CREATE TABLE IF NOT EXISTS role_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  area_type TEXT NOT NULL,        -- national|zone|state|lga|ward|group|directorate
  area_code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_roles_user ON role_assignments(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,             -- user|registrant
  user_id TEXT,
  phone_enc TEXT,
  phone_hash TEXT,
  mfa_ok INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  phone_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone_hash, created_at);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,          -- sms|whatsapp|email
  to_enc TEXT NOT NULL,
  to_hash TEXT NOT NULL,
  template TEXT,
  body TEXT NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drafts (
  owner_hash TEXT NOT NULL,
  flow TEXT NOT NULL,             -- group|volunteer
  step INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_hash, flow)
);

CREATE TABLE IF NOT EXISTS support_groups (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  category TEXT NOT NULL,
  category_other TEXT,
  operating_level TEXT NOT NULL,
  date_formed TEXT NOT NULL,
  description TEXT,
  cac_status TEXT,
  cac_number TEXT,
  estimated_size_range TEXT NOT NULL,
  state_code TEXT NOT NULL,
  lga_code TEXT,
  ward_code TEXT,
  address TEXT,
  latitude REAL,
  longitude REAL,
  directorate TEXT,
  has_online_platform INTEGER,
  website_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending|info_requested|verified|suspended|rejected
  status_reason TEXT,
  verified_by TEXT,
  verified_at TEXT,
  verification_method TEXT,
  join_code TEXT NOT NULL UNIQUE,
  registrant_hash TEXT NOT NULL,
  registration_channel TEXT NOT NULL DEFAULT 'web',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_groups_geo ON support_groups(state_code, lga_code, ward_code);
CREATE INDEX IF NOT EXISTS idx_groups_status ON support_groups(status, created_at);

CREATE TABLE IF NOT EXISTS group_areas_covered (
  group_id TEXT NOT NULL REFERENCES support_groups(id) ON DELETE CASCADE,
  area_type TEXT NOT NULL,
  area_code TEXT NOT NULL,
  PRIMARY KEY (group_id, area_type, area_code)
);

CREATE TABLE IF NOT EXISTS group_leaders (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES support_groups(id) ON DELETE CASCADE,
  position TEXT NOT NULL,
  position_other TEXT,
  first_name TEXT NOT NULL,
  surname TEXT NOT NULL,
  phone_enc TEXT,
  phone_hash TEXT,
  email_enc TEXT,
  gender TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_leaders_phone ON group_leaders(phone_hash);

CREATE TABLE IF NOT EXISTS group_online_platforms (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES support_groups(id) ON DELETE CASCADE,
  platform_types TEXT NOT NULL,   -- JSON array
  platform_name TEXT,
  audience_range TEXT,
  activity_frequency TEXT,
  link_url TEXT                   -- coordinators only
);

CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,       -- group|volunteer
  owner_id TEXT NOT NULL,
  network TEXT NOT NULL,
  label TEXT,
  handle TEXT,
  url TEXT
);
CREATE INDEX IF NOT EXISTS idx_social_owner ON social_accounts(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS volunteers (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  surname TEXT NOT NULL,
  name_key TEXT NOT NULL,
  gender TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  phone_enc TEXT NOT NULL,
  phone_hash TEXT NOT NULL UNIQUE,
  phone_verified_at TEXT,
  email_enc TEXT,
  vote_state_code TEXT NOT NULL,
  vote_lga_code TEXT NOT NULL,
  vote_ward_code TEXT NOT NULL,
  vote_pu_code TEXT,
  res_state_code TEXT,
  res_lga_code TEXT,
  res_ward_code TEXT,
  pvc_status TEXT NOT NULL,
  pvc_reminder INTEGER NOT NULL DEFAULT 0,
  group_id TEXT REFERENCES support_groups(id) ON DELETE SET NULL,
  group_status TEXT,              -- pending|approved (the group's own approval)
  occupation TEXT,
  availability TEXT,
  has_smartphone INTEGER,
  preferred_channel TEXT,
  registration_channel TEXT NOT NULL DEFAULT 'web',
  registered_by_agent TEXT,
  agent_latitude REAL,
  agent_longitude REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  status_reason TEXT,
  verified_by TEXT,
  verified_at TEXT,
  verification_method TEXT,
  deletion_requested_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vol_geo ON volunteers(vote_state_code, vote_lga_code, vote_ward_code);
CREATE INDEX IF NOT EXISTS idx_vol_group ON volunteers(group_id);
CREATE INDEX IF NOT EXISTS idx_vol_status ON volunteers(status, created_at);

CREATE TABLE IF NOT EXISTS volunteer_roles (
  volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  PRIMARY KEY (volunteer_id, role)
);
CREATE TABLE IF NOT EXISTS volunteer_languages (
  volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  PRIMARY KEY (volunteer_id, language)
);

CREATE TABLE IF NOT EXISTS duplicate_flags (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,      -- group|volunteer
  entity_id TEXT NOT NULL,
  other_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dup_entity ON duplicate_flags(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS consents (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  consent_type TEXT NOT NULL,     -- data|messaging|accuracy
  granted INTEGER NOT NULL,
  notice_version TEXT NOT NULL,
  channel TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  withdrawn_at TEXT
);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  file_name TEXT,
  declared_type TEXT,
  size INTEGER NOT NULL,
  offset INTEGER NOT NULL DEFAULT 0,
  temp_path TEXT NOT NULL,
  kind TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT,
  thumbnail_key TEXT,
  medium_key TEXT,
  file_hash TEXT,
  phash TEXT,
  mime TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,       -- group|activity|incident|task_report|result
  owner_id TEXT NOT NULL,
  group_id TEXT,
  uploaded_by TEXT,
  uploader_name TEXT,
  kind TEXT NOT NULL,             -- photo|video|link
  storage_key TEXT,
  medium_key TEXT,
  thumbnail_key TEXT,
  mime TEXT,
  external_url TEXT,
  event_name TEXT,
  event_date TEXT,
  state_code TEXT,
  lga_code TEXT,
  ward_code TEXT,
  caption TEXT,
  attendance INTEGER,
  people_consent_confirmed INTEGER NOT NULL DEFAULT 0,
  file_hash TEXT,
  phash TEXT,
  duplicate_of TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|publicity|rejected
  moderated_by TEXT,
  moderated_at TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_media_owner ON media_items(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_media_status ON media_items(moderation_status, created_at);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  group_id TEXT REFERENCES support_groups(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT,
  date TEXT NOT NULL,
  state_code TEXT NOT NULL,
  lga_code TEXT,
  ward_code TEXT,
  description TEXT,
  attendance INTEGER,
  households_reached INTEGER,
  new_signups INTEGER,
  concerns TEXT,                  -- JSON array
  incident_type TEXT,
  incident_details TEXT,
  review_status TEXT NOT NULL DEFAULT 'submitted',
  reported_by TEXT,
  reporter_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  target_value INTEGER,
  target_unit TEXT,
  area_type TEXT,
  area_code TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT,
  creator_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS task_assignments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  assignee_type TEXT NOT NULL,    -- group|volunteer|area
  assignee_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned'
);
CREATE TABLE IF NOT EXISTS task_reports (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  assignment_id TEXT,
  achieved_value INTEGER,
  notes TEXT,
  reported_by TEXT,
  reporter_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  audience TEXT NOT NULL,         -- JSON filter
  audience_label TEXT,
  recipient_count INTEGER NOT NULL,
  estimated_cost REAL NOT NULL,
  status TEXT NOT NULL,           -- awaiting_approval|sent|cancelled
  created_by TEXT,
  creator_name TEXT,
  approved_by TEXT,
  approver_name TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS message_recipients (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  volunteer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  PRIMARY KEY (message_id, volunteer_id)
);

CREATE TABLE IF NOT EXISTS pu_agents (
  pu_code TEXT NOT NULL,
  volunteer_id TEXT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  is_backup INTEGER NOT NULL DEFAULT 0,
  accreditation_status TEXT NOT NULL DEFAULT 'not_started', -- not_started|submitted|accredited|refused
  checked_in_at TEXT,
  assigned_by TEXT,
  PRIMARY KEY (pu_code, is_backup)
);
CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  pu_code TEXT NOT NULL UNIQUE,
  state_code TEXT NOT NULL,
  lga_code TEXT NOT NULL,
  ward_code TEXT NOT NULL,
  reported_by TEXT,
  party_votes TEXT NOT NULL,      -- JSON
  registered_voters INTEGER,
  accredited_voters INTEGER,
  rejected_votes INTEGER,
  sheet_media_id TEXT,
  confirmed_by TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  pu_code TEXT,
  state_code TEXT NOT NULL,
  lga_code TEXT,
  ward_code TEXT,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT,
  media_ids TEXT,
  reported_by TEXT,
  reporter_name TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  filters TEXT NOT NULL,
  reason TEXT,
  requested_by TEXT NOT NULL,
  requester_name TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_approval', -- awaiting_approval|approved|rejected|expired
  approved_by TEXT,
  approver_name TEXT,
  token TEXT,
  expires_at TEXT,
  downloaded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_requests (
  id TEXT PRIMARY KEY,
  subject_hash TEXT NOT NULL,
  kind TEXT NOT NULL,             -- deletion|correction|access
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  handled_by TEXT,
  handled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  ip TEXT,
  details TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(timestamp);

CREATE TABLE IF NOT EXISTS conversations (
  channel TEXT NOT NULL,          -- ussd|whatsapp
  phone_hash TEXT NOT NULL,
  state TEXT NOT NULL,            -- JSON
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (channel, phone_hash)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
`;

/*
 * Additive migrations for databases created before a column or table
 * existed. Each runs once; columns are only ever added, never changed.
 */
const COLUMNS = [
  ["support_groups", "logo_key", "TEXT"],
  ["support_groups", "membership_upload_id", "TEXT"],
  ["support_groups", "membership_count", "INTEGER"],
  ["support_groups", "certificate_no", "TEXT"],
  ["users", "email_hash", "TEXT"],
  ["uploads", "anon", "INTEGER NOT NULL DEFAULT 0"],
];

const EXTRA = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email_hash) WHERE email_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS group_member_list (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES support_groups(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  phone_enc TEXT,
  phone_hash TEXT,
  email_enc TEXT,
  gender TEXT,
  place TEXT,
  role TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_member_list_group ON group_member_list(group_id);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function migrate(db) {
  for (const [table, column, type] of COLUMNS) {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  db.exec(EXTRA);
}

function open() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const db = new DatabaseSync(DB_FILE);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

const g = globalThis;
export const db = g.__adcDb ?? (g.__adcDb = open());

/* ── Small query helpers ───────────────────────────────────────────────── */

// node:sqlite returns rows with a null prototype; copy them into plain
// objects so they can cross into client components and JSON unchanged.
export function all(sql, params = {}) {
  return db.prepare(sql).all(params).map((row) => ({ ...row }));
}

export function one(sql, params = {}) {
  const row = db.prepare(sql).get(params);
  return row ? { ...row } : null;
}

export function run(sql, params = {}) {
  return db.prepare(sql).run(params);
}

export function scalar(sql, params = {}) {
  const row = db.prepare(sql).get(params);
  return row ? Object.values(row)[0] : null;
}

let depth = 0;
/** Runs fn inside a transaction (nested calls join the outer one). */
export function tx(fn) {
  if (depth > 0) return fn();
  depth += 1;
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    depth -= 1;
  }
}

/** Atomic sequence, e.g. next group number within a state. */
export function nextCounter(name, start = 1) {
  return tx(() => {
    const row = one("SELECT value FROM counters WHERE name = :name", { name });
    const value = row ? row.value + 1 : start;
    run("INSERT INTO counters (name, value) VALUES (:name, :value) ON CONFLICT(name) DO UPDATE SET value = :value", { name, value });
    return value;
  });
}

export function getSetting(key, fallback = null) {
  const row = one("SELECT value FROM settings WHERE key = :key", { key });
  return row ? JSON.parse(row.value) : fallback;
}

export function setSetting(key, value) {
  run("INSERT INTO settings (key, value) VALUES (:key, :value) ON CONFLICT(key) DO UPDATE SET value = :value", {
    key,
    value: JSON.stringify(value),
  });
}

export const nowIso = () => new Date().toISOString().replace("T", " ").slice(0, 19);
