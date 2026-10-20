import { run } from "./db.js";

/**
 * Audit log (spec §15): every view of a full record, every edit, export,
 * message campaign and permission change. Append-only; nothing in the site
 * updates or deletes rows here.
 */
export function audit(viewer, action, entity = null, entityId = null, details = null, ip = null) {
  run(
    `INSERT INTO audit_log (actor, actor_name, action, entity, entity_id, ip, details)
     VALUES (:actor, :name, :action, :entity, :eid, :ip, :details)`,
    {
      actor: viewer?.id ?? null,
      name: viewer?.name ?? (viewer?.phone ? "Registrant" : "System"),
      action,
      entity,
      eid: entityId,
      ip,
      details: details == null ? null : JSON.stringify(details),
    },
  );
}
