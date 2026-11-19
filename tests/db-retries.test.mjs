import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATIONS } from '../lib/migrations.js';
import { run, tx } from '../lib/db.js';

function driver(value) {
  globalThis.__adcDbSchema = MIGRATIONS.at(-1).id;
  globalThis.__adcDb = Promise.resolve(value);
}
after(() => { delete globalThis.__adcDb; delete globalThis.__adcDbSchema; });

test('a lost write acknowledgement never replays a standalone mutation', async () => {
  let writes = 0;
  driver({ query: async () => { writes++; throw Object.assign(new Error('Connection terminated'), { code: 'ECONNRESET' }); } });
  await assert.rejects(run('UPDATE counters SET value = value + 1'), /Connection terminated/);
  assert.equal(writes, 1);
});

test('a lost commit acknowledgement never replays an entire transaction', async () => {
  let work = 0;
  driver({ session: fn => fn({ query: async sql => { if (sql === 'COMMIT') throw Object.assign(new Error('Connection terminated'), { code: 'ECONNRESET' }); return { rows: [], rowCount: 0 }; } }) });
  await assert.rejects(tx(async () => { work++; }), /Connection terminated/);
  assert.equal(work, 1);
});

test('a known serialization rollback remains retryable', async () => {
  let work = 0;
  driver({ session: fn => fn({ query: async () => ({ rows: [], rowCount: 0 }) }) });
  const value = await tx(async () => { if (++work === 1) throw Object.assign(new Error('serialization failure'), { code: '40001' }); return 'done'; });
  assert.equal(value, 'done');
  assert.equal(work, 2);
});
