export const mockUser = {
  githubId: '1',
  username: 'octocat',
  avatarUrl: 'https://github.com/octocat.png',
  accessToken: 'mock',
};

const daysAgo = (now, n, hour) => {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

export function mockPrs(now = new Date()) {
  const pr = (number, repo, state, created, end = null) => ({
    number,
    title: `Mock PR #${number}`,
    url: `https://github.com/${repo}/pull/${number}`,
    repo,
    owner: repo.split('/')[0],
    state,
    createdAt: daysAgo(now, created, 10),
    mergedAt: state === 'merged' ? daysAgo(now, end, 15) : null,
    closedAt: state === 'open' ? null : daysAgo(now, end, 15),
  });
  return [
    pr(101, 'vercel/next.js', 'open', 0),
    pr(102, 'vercel/next.js', 'merged', 2, 1),
    pr(103, 'facebook/react', 'merged', 3, 2),
    pr(104, 'facebook/react', 'closed', 5, 4),
    pr(105, 'nodejs/node', 'merged', 8, 6),
    pr(106, 'nodejs/node', 'open', 1),
    pr(107, 'nodejs/node', 'merged', 12, 10),
    pr(108, `${mockUser.username}/my-project`, 'merged', 4, 4),
  ];
}
