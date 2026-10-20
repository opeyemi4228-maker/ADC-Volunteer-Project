import { all, run, tx, nowIso } from "./db.js";
import { seal } from "./crypto.js";

/**
 * Carries out a deletion request (NDPA 2023, spec §15). Personal data is
 * removed and the row is anonymised rather than dropped, so counts, audit
 * history and group memberships that others rely on stay consistent.
 */
export function eraseSubject(phoneHash) {
  return tx(() => {
    const vols = all("SELECT id FROM volunteers WHERE phone_hash = :h", { h: phoneHash });
    for (const v of vols) {
      run(
        `UPDATE volunteers SET first_name = 'Deleted', middle_name = NULL, surname = 'person', name_key = 'deleted', date_of_birth = '1900-01-01',
           phone_enc = :blank, phone_hash = :gone, email_enc = NULL, occupation = NULL, vote_pu_code = NULL, res_state_code = NULL, res_lga_code = NULL,
           res_ward_code = NULL, agent_latitude = NULL, agent_longitude = NULL, status = 'rejected', status_reason = 'Deleted on request', updated_at = :now
         WHERE id = :id`,
        { id: v.id, blank: seal("deleted"), gone: `deleted:${v.id}`, now: nowIso() },
      );
      for (const t of ["volunteer_roles", "volunteer_languages"]) run(`DELETE FROM ${t} WHERE volunteer_id = :id`, { id: v.id });
      run("DELETE FROM social_accounts WHERE owner_type = 'volunteer' AND owner_id = :id", { id: v.id });
      run("DELETE FROM pu_agents WHERE volunteer_id = :id", { id: v.id });
      run("UPDATE consents SET withdrawn_at = :now WHERE subject_id = :id AND withdrawn_at IS NULL", { id: v.id, now: nowIso() });
    }
    const leaders = all("SELECT id FROM group_leaders WHERE phone_hash = :h", { h: phoneHash });
    for (const l of leaders) run("UPDATE group_leaders SET first_name = 'Deleted', surname = 'person', phone_enc = NULL, phone_hash = NULL, email_enc = NULL WHERE id = :id", { id: l.id });
    run("DELETE FROM drafts WHERE owner_hash = :h", { h: phoneHash });
    run("DELETE FROM sessions WHERE phone_hash = :h", { h: phoneHash });
    run("DELETE FROM conversations WHERE phone_hash = :h", { h: phoneHash });
    run("UPDATE outbox SET to_enc = :blank WHERE to_hash = :h", { blank: seal("deleted"), h: phoneHash });
    return { volunteers: vols.length, leaderRecords: leaders.length };
  });
}
