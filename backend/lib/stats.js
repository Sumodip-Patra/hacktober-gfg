const day = (iso) => iso.slice(0, 10);
const lower = (s) => s.toLowerCase();
const latest = (p) => [p.createdAt, p.mergedAt, p.closedAt].filter(Boolean).sort().at(-1);

export const filterScope = (prs, scope, username) =>
  scope === 'all' ? prs : prs.filter((p) => lower(p.owner) !== lower(username));

export const filterPulls = (prs, { state, repo }) =>
  prs.filter((p) => (state === 'all' || p.state === state) && (!repo || lower(p.repo) === lower(repo)));

export function groupRepos(prs) {
  const byRepo = new Map();
  for (const p of prs) {
    const g = byRepo.get(p.repo) ?? {
      fullName: p.repo,
      url: `https://github.com/${p.repo}`,
      prCount: 0,
      mergedCount: 0,
      lastActivityAt: null,
    };
    g.prCount += 1;
    if (p.state === 'merged') g.mergedCount += 1;
    const at = latest(p);
    if (at && (!g.lastActivityAt || at > g.lastActivityAt)) g.lastActivityAt = at;
    byRepo.set(p.repo, g);
  }
  return [...byRepo.values()].sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''));
}

const dayNumber = (d) => Date.parse(`${d}T00:00:00Z`) / 86400000;

function streaks(dates, today) {
  let longest = 0;
  let current = 0;
  let run = 0;
  let prev = null;
  for (const d of dates) {
    const n = dayNumber(d);
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    prev = n;
    longest = Math.max(longest, run);
    if (n === dayNumber(today) || n === dayNumber(today) - 1) current = run;
  }
  return { current, longest };
}

export function computeStats(prs, today) {
  const counts = new Map();
  for (const p of prs) {
    for (const t of [p.createdAt, p.mergedAt]) {
      if (t) counts.set(day(t), (counts.get(day(t)) ?? 0) + 1);
    }
  }
  const activityByDay = [...counts]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const byRepo = new Map();
  for (const p of prs) {
    const r = byRepo.get(p.repo) ?? { repo: p.repo, merged: 0, open: 0 };
    if (p.state === 'merged') r.merged += 1;
    if (p.state === 'open') r.open += 1;
    byRepo.set(p.repo, r);
  }
  const perRepo = [...byRepo.values()].sort(
    (a, b) => b.merged - a.merged || b.open - a.open || a.repo.localeCompare(b.repo),
  );

  const count = (state) => prs.filter((p) => p.state === state).length;
  return {
    totals: {
      totalPrs: prs.length,
      open: count('open'),
      merged: count('merged'),
      closedUnmerged: count('closed'),
      repos: byRepo.size,
    },
    streak: streaks(activityByDay.map((d) => d.date), today),
    perRepo,
    activityByDay,
  };
}
