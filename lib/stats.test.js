import test from 'node:test';
import assert from 'node:assert/strict';
import { filterScope, filterPulls, groupRepos, computeStats } from './stats.js';

const pr = (o) => ({ number: 1, title: 't', url: 'u', repo: 'a/b', owner: 'a', state: 'open',
  createdAt: null, mergedAt: null, closedAt: null, ...o });
const days = (...ds) => ds.map((d) => pr({ createdAt: `${d}T10:00:00Z` }));

test('empty history gives zeros and empty lists', () => {
  assert.deepEqual(computeStats([], '2026-10-02'), {
    totals: { totalPrs: 0, open: 0, merged: 0, closedUnmerged: 0, repos: 0 },
    streak: { current: 0, longest: 0 }, perRepo: [], activityByDay: [] });
});
test('streak ending today', () => {
  assert.deepEqual(computeStats(days('2026-09-30', '2026-10-01', '2026-10-02'), '2026-10-02').streak, { current: 3, longest: 3 });
});
test('streak ending yesterday is still current', () => {
  assert.equal(computeStats(days('2026-09-30', '2026-10-01'), '2026-10-02').streak.current, 2);
});
test('activity older than yesterday resets current only', () => {
  assert.deepEqual(computeStats(days('2026-09-28', '2026-09-29'), '2026-10-02').streak, { current: 0, longest: 2 });
});
test('a gap splits runs', () => {
  const ds = days('2026-09-26', '2026-09-27', '2026-09-28', '2026-10-01', '2026-10-02');
  assert.deepEqual(computeStats(ds, '2026-10-02').streak, { current: 2, longest: 3 });
});
test('PR opened and merged the same day counts twice', () => {
  const p = pr({ state: 'merged', createdAt: '2026-10-01T01:00:00Z', mergedAt: '2026-10-01T09:00:00Z' });
  assert.deepEqual(computeStats([p], '2026-10-02').activityByDay, [{ date: '2026-10-01', count: 2 }]);
});
test('PR merged on a later day counts on both days', () => {
  const p = pr({ state: 'merged', createdAt: '2026-09-30T10:00:00Z', mergedAt: '2026-10-01T10:00:00Z' });
  const s = computeStats([p], '2026-10-02');
  assert.deepEqual(s.activityByDay, [{ date: '2026-09-30', count: 1 }, { date: '2026-10-01', count: 1 }]);
  assert.equal(s.streak.current, 2);
});
test('dates use UTC', () => {
  const ps = [pr({ createdAt: '2026-10-01T23:59:59Z' }), pr({ createdAt: '2026-10-02T00:00:00Z' })];
  assert.deepEqual(computeStats(ps, '2026-10-02').activityByDay.map((d) => d.date), ['2026-10-01', '2026-10-02']);
});
test('totals and perRepo', () => {
  const ps = [pr({ state: 'open' }), pr({ state: 'merged', mergedAt: '2026-10-01T00:00:00Z' }), pr({ state: 'closed', repo: 'c/d' })];
  const s = computeStats(ps, '2026-10-02');
  assert.deepEqual(s.totals, { totalPrs: 3, open: 1, merged: 1, closedUnmerged: 1, repos: 2 });
  assert.deepEqual(s.perRepo, [{ repo: 'a/b', merged: 1, open: 1 }, { repo: 'c/d', merged: 0, open: 0 }]);
});
test('external scope drops own repos, case-insensitively', () => {
  const ps = [pr({ owner: 'Sumo' }), pr({ owner: 'other' })];
  assert.deepEqual(filterScope(ps, 'external', 'sumo').map((p) => p.owner), ['other']);
  assert.equal(filterScope(ps, 'all', 'sumo').length, 2);
});
test('filterPulls by state and repo, repo case-insensitive', () => {
  const ps = [pr({ repo: 'Foo/Bar' }), pr({ state: 'merged', repo: 'foo/bar' }), pr({ repo: 'x/y' })];
  assert.equal(filterPulls(ps, { state: 'open', repo: 'foo/BAR' }).length, 1);
  assert.equal(filterPulls(ps, { state: 'all' }).length, 3);
});
test('groupRepos counts and latest activity', () => {
  const ps = [pr({ state: 'merged', createdAt: '2026-09-01T00:00:00Z', mergedAt: '2026-09-05T00:00:00Z' }), pr({ createdAt: '2026-09-03T00:00:00Z' })];
  assert.deepEqual(groupRepos(ps), [{ fullName: 'a/b', url: 'https://github.com/a/b', prCount: 2, mergedCount: 1, lastActivityAt: '2026-09-05T00:00:00Z' }]);
});
