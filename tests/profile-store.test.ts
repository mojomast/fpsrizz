import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProfileStore, PROFILE_KEY } from '../src/platform/profile-store.ts';
import type { Profile, ProfileStorage } from '../src/platform/profile-store.ts';

function memory() {
  const data = new Map<string, string>();
  const storage: ProfileStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
  };
  return { data, storage };
}

test('profiles persist across instances and copies are isolated', () => {
  const { data, storage } = memory();
  const store = createProfileStore(storage);
  assert.deepEqual(store.load(), { ok: true, value: null });
  const profile = { values: { 'unlock/door': true, 'score/arena': 42, name: 'Ace', constructor: 'safe' } };
  assert.equal(store.save(profile).ok, true);
  profile.values.name = 'changed';
  const loaded = createProfileStore(storage).load();
  assert.equal(loaded.ok, true);
  if (!loaded.ok || !loaded.value) throw new Error('profile missing');
  assert.equal(loaded.value.values.name, 'Ace');
  assert.equal(loaded.value.values.constructor, 'safe');
  loaded.value.values.name = 'mutated';
  assert.equal((store.load() as { ok: true; value: Profile }).value.values.name, 'Ace');
  data.set('shooter-foundation/settings', 'keep');
  assert.equal(store.clear().ok, true);
  assert.equal(data.get('shooter-foundation/settings'), 'keep');
  assert.deepEqual(store.load(), { ok: true, value: null });
});

test('reports unavailable storage including quota and read/remove errors', () => {
  const missing = createProfileStore(null);
  assert.deepEqual(missing.load(), { ok: false, reason: 'unavailable' });
  assert.deepEqual(missing.save({ values: {} }), { ok: false, reason: 'unavailable' });
  assert.deepEqual(missing.clear(), { ok: false, reason: 'unavailable' });
  const { storage } = memory();
  const quota = createProfileStore({ ...storage, setItem: () => { throw new Error('quota'); } });
  assert.deepEqual(quota.save({ values: {} }), { ok: false, reason: 'unavailable' });
  const broken = createProfileStore({ ...storage, getItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } });
  assert.deepEqual(broken.load(), { ok: false, reason: 'unavailable' });
  assert.deepEqual(broken.clear(), { ok: false, reason: 'unavailable' });
});

test('rejects corrupt and incompatible data without overwriting it', () => {
  const { data, storage } = memory();
  const store = createProfileStore(storage);
  for (const raw of ['{', 'null', '{"schema":1,"values":{"x":null}}', '{"schema":1,"values":{"x":1e999}}', '{"schema":1,"values":{},"extra":true}', '{"schema":0,"values":{}}']) {
    data.set(PROFILE_KEY, raw);
    assert.deepEqual(store.load(), { ok: false, reason: 'corrupt' });
    assert.deepEqual(store.save({ values: {} }), { ok: false, reason: 'corrupt' });
    assert.equal(data.get(PROFILE_KEY), raw);
  }
  data.set(PROFILE_KEY, '{"schema":2,"values":{}}');
  assert.deepEqual(store.load(), { ok: false, reason: 'incompatible' });
  assert.deepEqual(store.save({ values: {} }), { ok: false, reason: 'incompatible' });
  assert.equal(data.get(PROFILE_KEY), '{"schema":2,"values":{}}');
  assert.equal(store.clear().ok, true);
});

test('rejects invalid values and dangerous keys without changing stored profile', () => {
  const { data, storage } = memory();
  const store = createProfileStore(storage);
  store.save({ values: { score: 1 } });
  const before = data.get(PROFILE_KEY);
  for (const values of [{ score: NaN }, { score: Infinity }, { score: {} }, { '': true }, JSON.parse('{"__proto__":true}'), new Date()]) {
    assert.deepEqual(store.save({ values } as Profile), { ok: false, reason: 'invalid' });
    assert.equal(data.get(PROFILE_KEY), before);
  }
  const other = createProfileStore(storage, 'other');
  assert.equal(other.save({ values: { score: 9 } }).ok, true);
  assert.equal(data.get(PROFILE_KEY), before);
});
