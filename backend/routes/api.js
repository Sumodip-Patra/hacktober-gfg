import { Router } from 'express';
import { getUser } from '../lib/auth.js';
import { getPullRequests } from '../lib/github.js';
import { oneOf } from '../lib/errors.js';
import { filterScope, filterPulls, groupRepos, computeStats } from '../lib/stats.js';

const router = Router();
const scopeOf = (req) => oneOf(req.query.scope ?? null, ['external', 'all'], 'external', 'scope');

router.get('/me', (req, res) => {
  const { username, avatarUrl } = getUser(req);
  res.json({ username, avatarUrl, profileUrl: `https://github.com/${username}` });
});

router.get('/repos', async (req, res) => {
  const scope = scopeOf(req);
  const user = getUser(req);
  res.json(groupRepos(filterScope(await getPullRequests(user), scope, user.username)));
});

router.get('/pulls', async (req, res) => {
  const scope = scopeOf(req);
  const state = oneOf(req.query.state ?? null, ['open', 'merged', 'closed', 'all'], 'all', 'state');
  const repo = req.query.repo;
  const user = getUser(req);
  const prs = filterPulls(filterScope(await getPullRequests(user), scope, user.username), { state, repo });
  res.json(prs.map(({ owner, ...pull }) => pull));
});

router.get('/stats', async (req, res) => {
  const scope = scopeOf(req);
  const user = getUser(req);
  const prs = filterScope(await getPullRequests(user), scope, user.username);
  res.json(computeStats(prs, new Date().toISOString().slice(0, 10)));
});

export default router;
