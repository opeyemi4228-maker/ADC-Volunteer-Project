import fs from "node:fs";

import { all, run, tx, nowIso } from "./db.js";
import { seal } from "./crypto.js";
import { objectPath } from "./storage.js";

/**
 * Carries out a deletion request (NDPA 2023, spec §15). Personal data is
 * removed and the row is anonymised rather than dropped, so counts, audit
 * history and group memberships that others rely on stay consistent.
 */
export async function eraseSubject(phoneHash) {
  return await tx(async () => {
    const vols = await all("SELECT id, photo_key, photo_thumb_key FROM volunteers WHERE phone_hash = :h", { h: phoneHash });
    for (const v of vols) {
      await run(
        `UPDATE volunteers SET first_name = 'Deleted', middle_name = NULL, surname = 'person', name_key = 'deleted', date_of_birth = '1900-01-01',
           phone_enc = :blank, phone_hash = :gone, email_enc = NULL, occupation = NULL, vote_pu_code = NULL, res_state_code = NULL, res_lga_code = NULL,
           res_ward_code = NULL, agent_latitude = NULL, agent_longitude = NULL, photo_key = NULL, photo_thumb_key = NULL,
           status = 'rejected', status_reason = 'Deleted on request', updated_at = :now
         WHERE id = :id`,
        { id: v.id, blank: seal("deleted"), gone: `deleted:${v.id}`, now: nowIso() },
      );
      for (const k of [v.photo_key, v.photo_thumb_key]) if (k) fs.rm(objectPath(k), { force: true }, () => {});
      for (const t of ["volunteer_roles", "volunteer_languages"]) await run(`DELETE FROM ${t} WHERE volunteer_id = :id`, { id: v.id });
      await run("DELETE FROM social_accounts WHERE owner_type = 'volunteer' AND owner_id = :id", { id: v.id });
      await run("DELETE FROM pu_agents WHERE volunteer_id = :id", { id: v.id });
      await run("UPDATE consents SET withdrawn_at = :now WHERE subject_id = :id AND withdrawn_at IS NULL", { id: v.id, now: nowIso() });
    }
    const leaders = await all("SELECT id FROM group_leaders WHERE phone_hash = :h", { h: phoneHash });
    for (const l of leaders) await run("UPDATE group_leaders SET first_name = 'Deleted', surname = 'person', phone_enc = NULL, phone_hash = NULL, email_enc = NULL WHERE id = :id", { id: l.id });
    await run("DELETE FROM drafts WHERE owner_hash = :h", { h: phoneHash });
    await run("DELETE FROM sessions WHERE phone_hash = :h", { h: phoneHash });
    await run("DELETE FROM conversations WHERE phone_hash = :h", { h: phoneHash });
    await run("UPDATE outbox SET to_enc = :blank WHERE to_hash = :h", { blank: seal("deleted"), h: phoneHash });
    return { volunteers: vols.length, leaderRecords: leaders.length };
  });
}
