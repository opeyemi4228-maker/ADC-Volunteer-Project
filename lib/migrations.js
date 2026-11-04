/**
 * Schema migrations, applied in order by migrate() in lib/db.js and recorded
 * in schema_migrations. Released migrations are never edited: a change is a
 * new entry at the end.
 *
 * Design rules:
 * - Every timestamp is timestamptz (stored as UTC); dates of birth are dates.
 * - Fixed lists (statuses, roles, channels) are CHECK-constrained, so a bug
 *   or a crafted request can not store a value the site does not know.
 * - Flags are smallint 0/1, constrained to those two values.
 * - JSON is jsonb: Postgres rejects anything that is not valid JSON.
 * - Phone numbers and emails only ever appear sealed (*_enc) or hashed (*_hash).
 * - The audit log is append-only, enforced by a trigger as well as by grants.
 */

const flag = (col, def = 0) => `${col} smallint NOT NULL DEFAULT ${def} CHECK (${col} IN (0, 1))`;
const nflag = (col) => `${col} smallint CHECK (${col} IN (0, 1))`;
const oneOf = (col, values) => `CHECK (${col} IN (${values.map((v) => `'${v}'`).join(", ")}))`;

const ROLES = ["group_coordinator", "ward_coordinator", "lga_coordinator", "state_coordinator", "zonal_coordinator", "directorate_head", "national_admin", "dpo", "field_agent", "volunteer"];
const RECORD_STATUS = ["pending", "info_requested", "verified", "rejected"];
const GROUP_STATUS = ["pending", "info_requested", "verified", "suspended", "rejected"];
const CHANNELS = ["web", "whatsapp", "ussd", "field_agent"];

const INIT = `
CREATE TABLE users (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  phone_enc text NOT NULL,
  phone_hash text NOT NULL UNIQUE,
  email_enc text,
  email_hash text,
  password_hash text NOT NULL,
  ${flag("active", 1)},
  volunteer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_signin_at timestamptz
);
CREATE UNIQUE INDEX idx_users_email ON users (email_hash) WHERE email_hash IS NOT NULL;

CREATE TABLE role_assignments (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL ${oneOf("role", ROLES)},
  area_type text NOT NULL ${oneOf("area_type", ["national", "zone", "state", "lga", "ward", "group", "directorate", "volunteer"])},
  area_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  UNIQUE (user_id, role, area_code)
);
CREATE INDEX idx_roles_user ON role_assignments (user_id);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  kind text NOT NULL ${oneOf("kind", ["user", "registrant"])},
  user_id text REFERENCES users (id) ON DELETE CASCADE,
  phone_enc text,
  phone_hash text,
  ${flag("mfa_ok")},
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_sessions_expiry ON sessions (expires_at);
CREATE INDEX idx_sessions_user ON sessions (user_id);

CREATE TABLE otp_codes (
  id text PRIMARY KEY,
  phone_hash text NOT NULL,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  ip text
);
CREATE INDEX idx_otp_phone ON otp_codes (phone_hash, created_at);

CREATE TABLE outbox (
  id text PRIMARY KEY,
  channel text NOT NULL ${oneOf("channel", ["sms", "whatsapp", "email"])},
  to_enc text NOT NULL,
  to_hash text NOT NULL,
  template text,
  body text NOT NULL,
  message_id text,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_outbox_message ON outbox (message_id);

CREATE TABLE drafts (
  owner_hash text NOT NULL,
  flow text NOT NULL,
  step integer NOT NULL DEFAULT 1,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_hash, flow)
);

CREATE TABLE support_groups (
  id text PRIMARY KEY,
  public_id text NOT NULL UNIQUE,
  name text NOT NULL,
  name_key text NOT NULL,
  category text NOT NULL,
  category_other text,
  operating_level text NOT NULL ${oneOf("operating_level", ["ward", "lga", "state", "zonal", "national"])},
  date_formed text NOT NULL,
  description text,
  cac_status text,
  cac_number text,
  estimated_size_range text NOT NULL,
  state_code text NOT NULL,
  lga_code text,
  ward_code text,
  address text,
  latitude double precision,
  longitude double precision,
  directorate text,
  ${nflag("has_online_platform")},
  website_url text,
  status text NOT NULL DEFAULT 'pending' ${oneOf("status", GROUP_STATUS)},
  status_reason text,
  verified_by text,
  verified_at timestamptz,
  verification_method text,
  join_code text NOT NULL UNIQUE,
  registrant_hash text NOT NULL,
  registration_channel text NOT NULL DEFAULT 'web' ${oneOf("registration_channel", CHANNELS)},
  logo_key text,
  membership_upload_id text,
  membership_count integer,
  certificate_no text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_groups_geo ON support_groups (state_code, lga_code, ward_code);
CREATE INDEX idx_groups_status ON support_groups (status, created_at);
CREATE INDEX idx_groups_directorate ON support_groups (directorate);

CREATE TABLE group_areas_covered (
  group_id text NOT NULL REFERENCES support_groups (id) ON DELETE CASCADE,
  area_type text NOT NULL,
  area_code text NOT NULL,
  PRIMARY KEY (group_id, area_type, area_code)
);

CREATE TABLE group_leaders (
  id text PRIMARY KEY,
  group_id text NOT NULL REFERENCES support_groups (id) ON DELETE CASCADE,
  position text NOT NULL,
  position_other text,
  first_name text NOT NULL,
  surname text NOT NULL,
  phone_enc text,
  phone_hash text,
  email_enc text,
  gender text,
  sort integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_leaders_group ON group_leaders (group_id);
CREATE INDEX idx_leaders_phone ON group_leaders (phone_hash);

CREATE TABLE group_online_platforms (
  id text PRIMARY KEY,
  group_id text NOT NULL REFERENCES support_groups (id) ON DELETE CASCADE,
  platform_types jsonb NOT NULL,
  platform_name text,
  audience_range text,
  activity_frequency text,
  link_url text
);
CREATE INDEX idx_platforms_group ON group_online_platforms (group_id);

CREATE TABLE social_accounts (
  id text PRIMARY KEY,
  owner_type text NOT NULL ${oneOf("owner_type", ["group", "volunteer"])},
  owner_id text NOT NULL,
  network text NOT NULL,
  label text,
  handle text,
  url text
);
CREATE INDEX idx_social_owner ON social_accounts (owner_type, owner_id);

CREATE TABLE volunteers (
  id text PRIMARY KEY,
  public_id text NOT NULL UNIQUE,
  first_name text NOT NULL,
  middle_name text,
  surname text NOT NULL,
  name_key text NOT NULL,
  gender text NOT NULL ${oneOf("gender", ["male", "female", "undisclosed"])},
  date_of_birth date NOT NULL,
  phone_enc text NOT NULL,
  phone_hash text NOT NULL UNIQUE,
  phone_verified_at timestamptz,
  email_enc text,
  vote_state_code text NOT NULL,
  vote_lga_code text NOT NULL,
  vote_ward_code text NOT NULL,
  vote_pu_code text,
  res_state_code text,
  res_lga_code text,
  res_ward_code text,
  pvc_status text NOT NULL ${oneOf("pvc_status", ["yes", "not_collected", "not_registered"])},
  ${flag("pvc_reminder")},
  group_id text REFERENCES support_groups (id) ON DELETE SET NULL,
  group_status text,
  occupation text,
  availability text,
  ${nflag("has_smartphone")},
  preferred_channel text,
  registration_channel text NOT NULL DEFAULT 'web' ${oneOf("registration_channel", CHANNELS)},
  registered_by_agent text,
  agent_latitude double precision,
  agent_longitude double precision,
  status text NOT NULL DEFAULT 'pending' ${oneOf("status", RECORD_STATUS)},
  status_reason text,
  verified_by text,
  verified_at timestamptz,
  verification_method text,
  deletion_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vol_geo ON volunteers (vote_state_code, vote_lga_code, vote_ward_code);
CREATE INDEX idx_vol_ward ON volunteers (vote_ward_code);
CREATE INDEX idx_vol_lga ON volunteers (vote_lga_code);
CREATE INDEX idx_vol_pu ON volunteers (vote_pu_code);
CREATE INDEX idx_vol_group ON volunteers (group_id);
CREATE INDEX idx_vol_status ON volunteers (status, created_at);
CREATE INDEX idx_vol_created ON volunteers (created_at);
CREATE INDEX idx_vol_verified ON volunteers (verified_at);
CREATE INDEX idx_vol_agent ON volunteers (registered_by_agent);
CREATE INDEX idx_vol_name ON volunteers (name_key);

CREATE TABLE volunteer_roles (
  volunteer_id text NOT NULL REFERENCES volunteers (id) ON DELETE CASCADE,
  role text NOT NULL,
  PRIMARY KEY (volunteer_id, role)
);
CREATE INDEX idx_volroles_role ON volunteer_roles (role);

CREATE TABLE volunteer_languages (
  volunteer_id text NOT NULL REFERENCES volunteers (id) ON DELETE CASCADE,
  language text NOT NULL,
  PRIMARY KEY (volunteer_id, language)
);

CREATE TABLE duplicate_flags (
  id text PRIMARY KEY,
  entity_type text NOT NULL ${oneOf("entity_type", ["group", "volunteer"])},
  entity_id text NOT NULL,
  other_id text NOT NULL,
  reason text NOT NULL,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dup_entity ON duplicate_flags (entity_type, entity_id);

CREATE TABLE consents (
  id text PRIMARY KEY,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  consent_type text NOT NULL,
  ${flag("granted")},
  notice_version text NOT NULL,
  channel text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz
);
CREATE INDEX idx_consents_subject ON consents (subject_type, subject_id);

CREATE TABLE uploads (
  id text PRIMARY KEY,
  owner_hash text NOT NULL,
  file_name text,
  declared_type text,
  size bigint NOT NULL CHECK (size >= 0),
  "offset" bigint NOT NULL DEFAULT 0 CHECK ("offset" >= 0),
  temp_path text NOT NULL,
  kind text,
  ${flag("done")},
  storage_key text,
  thumbnail_key text,
  medium_key text,
  file_hash text,
  phash text,
  mime text,
  error text,
  ${flag("anon")},
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_uploads_owner ON uploads (owner_hash);

CREATE TABLE media_items (
  id text PRIMARY KEY,
  owner_type text NOT NULL,
  owner_id text NOT NULL,
  group_id text,
  uploaded_by text,
  uploader_name text,
  kind text NOT NULL ${oneOf("kind", ["photo", "video", "link", "document"])},
  storage_key text,
  medium_key text,
  thumbnail_key text,
  mime text,
  external_url text,
  event_name text,
  event_date text,
  state_code text,
  lga_code text,
  ward_code text,
  caption text,
  attendance integer,
  ${flag("people_consent_confirmed")},
  file_hash text,
  phash text,
  duplicate_of text,
  moderation_status text NOT NULL DEFAULT 'pending' ${oneOf("moderation_status", ["pending", "approved", "publicity", "rejected"])},
  moderated_by text,
  moderated_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_owner ON media_items (owner_type, owner_id);
CREATE INDEX idx_media_status ON media_items (moderation_status, created_at);
CREATE INDEX idx_media_group ON media_items (group_id);
CREATE INDEX idx_media_hash ON media_items (file_hash);

CREATE TABLE activities (
  id text PRIMARY KEY,
  public_id text NOT NULL UNIQUE,
  group_id text REFERENCES support_groups (id) ON DELETE SET NULL,
  type text NOT NULL,
  title text,
  date text NOT NULL,
  state_code text NOT NULL,
  lga_code text,
  ward_code text,
  description text,
  attendance integer,
  households_reached integer,
  new_signups integer,
  concerns jsonb,
  incident_type text,
  incident_details text,
  review_status text NOT NULL DEFAULT 'submitted',
  reported_by text,
  reporter_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_group ON activities (group_id, date);
CREATE INDEX idx_activities_date ON activities (date);

CREATE TABLE tasks (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  due_date text,
  target_value integer,
  target_unit text,
  area_type text,
  area_code text,
  status text NOT NULL DEFAULT 'open',
  created_by text,
  creator_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE task_assignments (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  assignee_type text NOT NULL,
  assignee_id text NOT NULL,
  status text NOT NULL DEFAULT 'assigned'
);
CREATE INDEX idx_assignments_task ON task_assignments (task_id);
CREATE INDEX idx_assignments_assignee ON task_assignments (assignee_type, assignee_id);
CREATE TABLE task_reports (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  assignment_id text,
  achieved_value integer,
  notes text,
  reported_by text,
  reporter_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_task ON task_reports (task_id);

CREATE TABLE messages (
  id text PRIMARY KEY,
  channel text NOT NULL,
  subject text,
  body text NOT NULL,
  audience jsonb NOT NULL,
  audience_label text,
  recipient_count integer NOT NULL CHECK (recipient_count >= 0),
  estimated_cost double precision NOT NULL,
  status text NOT NULL,
  created_by text,
  creator_name text,
  approved_by text,
  approver_name text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_status ON messages (status);
CREATE TABLE message_recipients (
  message_id text NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  volunteer_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  PRIMARY KEY (message_id, volunteer_id)
);

CREATE TABLE pu_agents (
  pu_code text NOT NULL,
  volunteer_id text NOT NULL REFERENCES volunteers (id) ON DELETE CASCADE,
  ${flag("is_backup")},
  accreditation_status text NOT NULL DEFAULT 'not_started' ${oneOf("accreditation_status", ["not_started", "submitted", "accredited", "refused"])},
  checked_in_at timestamptz,
  assigned_by text,
  PRIMARY KEY (pu_code, is_backup)
);
CREATE INDEX idx_agents_volunteer ON pu_agents (volunteer_id);

CREATE TABLE results (
  id text PRIMARY KEY,
  pu_code text NOT NULL UNIQUE,
  state_code text NOT NULL,
  lga_code text NOT NULL,
  ward_code text NOT NULL,
  reported_by text,
  party_votes jsonb NOT NULL,
  registered_voters integer CHECK (registered_voters >= 0),
  accredited_voters integer CHECK (accredited_voters >= 0),
  rejected_votes integer CHECK (rejected_votes >= 0),
  sheet_media_id text,
  confirmed_by text,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_results_ward ON results (ward_code);

CREATE TABLE incidents (
  id text PRIMARY KEY,
  pu_code text,
  state_code text NOT NULL,
  lga_code text,
  ward_code text,
  category text NOT NULL,
  severity text NOT NULL,
  description text,
  media_ids jsonb,
  reported_by text,
  reporter_name text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_incidents_geo ON incidents (state_code, lga_code, ward_code);

CREATE TABLE exports (
  id text PRIMARY KEY,
  kind text NOT NULL ${oneOf("kind", ["volunteers", "groups"])},
  filters jsonb NOT NULL,
  reason text,
  requested_by text NOT NULL,
  requester_name text,
  status text NOT NULL DEFAULT 'awaiting_approval' ${oneOf("status", ["awaiting_approval", "approved", "rejected", "expired"])},
  approved_by text,
  approver_name text,
  token text,
  expires_at timestamptz,
  downloaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Nobody approves their own export.
  CHECK (approved_by IS NULL OR approved_by <> requested_by)
);
CREATE INDEX idx_exports_status ON exports (status, created_at);
CREATE INDEX idx_exports_requester ON exports (requested_by);

CREATE TABLE data_requests (
  id text PRIMARY KEY,
  subject_hash text NOT NULL,
  kind text NOT NULL ${oneOf("kind", ["deletion", "correction", "access"])},
  details jsonb,
  status text NOT NULL DEFAULT 'open',
  handled_by text,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_data_requests_status ON data_requests (status);

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor text,
  actor_name text,
  action text NOT NULL,
  entity text,
  entity_id text,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  ip text,
  details jsonb
);
CREATE INDEX idx_audit_time ON audit_log ("timestamp");
CREATE INDEX idx_audit_entity ON audit_log (entity, entity_id);
CREATE INDEX idx_audit_action ON audit_log (action, "timestamp");
CREATE INDEX idx_audit_ip ON audit_log (ip, action, "timestamp");

-- The audit log can only grow. Even an account that somehow gained
-- UPDATE or DELETE rights on it is stopped here.
CREATE FUNCTION audit_log_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END
$fn$;
CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_is_append_only();

CREATE TABLE conversations (
  channel text NOT NULL ${oneOf("channel", ["ussd", "whatsapp"])},
  phone_hash text NOT NULL,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, phone_hash)
);

CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE counters (
  name text PRIMARY KEY,
  value integer NOT NULL
);

CREATE TABLE group_member_list (
  id text PRIMARY KEY,
  group_id text NOT NULL REFERENCES support_groups (id) ON DELETE CASCADE,
  row_no integer NOT NULL,
  full_name text NOT NULL,
  phone_enc text,
  phone_hash text,
  email_enc text,
  gender text,
  place text,
  role text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_member_list_group ON group_member_list (group_id);

CREATE TABLE password_resets (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

/**
 * Accounts: the supervising body (super_admin), the coordinator positions
 * the Super Admin hands out (ward, LGA, state and zonal coordinators,
 * directorate heads, field agents) and volunteers. The old national admin
 * account becomes the supervising body's. Data protection officer and group
 * coordinator accounts are signed out and deactivated (kept, not deleted, so
 * the audit log still names who did what). Volunteers now take part in
 * tasks, activities and media, so those rows record which volunteer did it.
 */
const TWO_ACCOUNT_TYPES = `
-- The old check does not allow 'super_admin', so drop it before renaming.
ALTER TABLE role_assignments DROP CONSTRAINT IF EXISTS role_assignments_role_check;
UPDATE role_assignments SET role = 'super_admin', area_type = 'national', area_code = 'NG' WHERE role = 'national_admin';
DELETE FROM sessions WHERE user_id IN (SELECT user_id FROM role_assignments WHERE role NOT IN ('super_admin', 'ward_coordinator', 'lga_coordinator', 'state_coordinator', 'zonal_coordinator', 'directorate_head', 'field_agent', 'volunteer'));
UPDATE users SET active = 0
 WHERE id IN (SELECT user_id FROM role_assignments WHERE role NOT IN ('super_admin', 'ward_coordinator', 'lga_coordinator', 'state_coordinator', 'zonal_coordinator', 'directorate_head', 'field_agent', 'volunteer'))
   AND id NOT IN (SELECT user_id FROM role_assignments WHERE role IN ('super_admin', 'ward_coordinator', 'lga_coordinator', 'state_coordinator', 'zonal_coordinator', 'directorate_head', 'field_agent', 'volunteer'));
DELETE FROM role_assignments WHERE role NOT IN ('super_admin', 'ward_coordinator', 'lga_coordinator', 'state_coordinator', 'zonal_coordinator', 'directorate_head', 'field_agent', 'volunteer');
ALTER TABLE role_assignments ADD CONSTRAINT role_assignments_role_check CHECK (role IN ('super_admin', 'ward_coordinator', 'lga_coordinator', 'state_coordinator', 'zonal_coordinator', 'directorate_head', 'field_agent', 'volunteer'));

-- A task can be aimed at volunteers who offered one role (e.g. PU agents only).
ALTER TABLE tasks ADD COLUMN role text;
ALTER TABLE task_reports ADD COLUMN volunteer_id text REFERENCES volunteers (id) ON DELETE SET NULL;
CREATE INDEX idx_reports_volunteer ON task_reports (volunteer_id);

ALTER TABLE activities ADD COLUMN volunteer_id text REFERENCES volunteers (id) ON DELETE SET NULL;
ALTER TABLE activities ADD COLUMN review_note text;
ALTER TABLE activities ADD COLUMN reviewed_by text;
ALTER TABLE activities ADD COLUMN reviewed_at timestamptz;
ALTER TABLE activities ADD CONSTRAINT activities_review_status_check CHECK (review_status IN ('submitted', 'approved', 'rejected'));
CREATE INDEX idx_activities_volunteer ON activities (volunteer_id, date);
CREATE INDEX idx_activities_review ON activities (review_status, created_at);

ALTER TABLE media_items ADD COLUMN volunteer_id text REFERENCES volunteers (id) ON DELETE SET NULL;
CREATE INDEX idx_media_volunteer ON media_items (volunteer_id);

CREATE INDEX idx_recipients_volunteer ON message_recipients (volunteer_id);
`;

export const MIGRATIONS = [
  { id: "0001_init", sql: INIT },
  { id: "0002_two_account_types", sql: TWO_ACCOUNT_TYPES },
];
