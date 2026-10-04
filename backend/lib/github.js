import { ApiError } from './errors.js';
import { PrSnapshot } from './db.js';
import { mockPrs } from './mock.js';

const MAX_PAGES = 3;

const QUERY = `query($q: String!, $cursor: String) {
  search(query: $q, type: ISSUE, first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title url state merged createdAt mergedAt closedAt
        repository { nameWithOwner owner { login } }
      }
    }
  }
}`;

const upstream = () => new ApiError(502, 'UPSTREAM_ERROR', 'GitHub is unavailable.');
const rateLimited = () => new ApiError(429, 'RATE_LIMITED', 'GitHub rate limit reached.');

async function graphql(token, variables) {
  let res;
  let body;
  try {
    res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables }),
    });
    if (res.ok) body = await res.json();
  } catch {
    throw upstream();
  }
  if (res.status === 401) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in.');
  if (res.status === 403 || res.status === 429) throw rateLimited();
  if (!res.ok) throw upstream();
  if (body.errors?.some((e) => e.type === 'RATE_LIMITED')) throw rateLimited();
  if (body.errors) throw upstream();
  return body.data.search;
}

const toPr = (n) => ({
  number: n.number,
  title: n.title,
  url: n.url,
  repo: n.repository.nameWithOwner,
  owner: n.repository.owner.login,
  state: n.merged ? 'merged' : n.state === 'OPEN' ? 'open' : 'closed',
  createdAt: n.createdAt,
  mergedAt: n.mergedAt,
  closedAt: n.closedAt,
});

async function fetchAll(user) {
  const q = `author:${user.username} type:pr is:public sort:created-desc`;
  const prs = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { pageInfo, nodes } = await graphql(user.accessToken, { q, cursor });
    prs.push(...nodes.map(toPr));
    if (!pageInfo.hasNextPage) break;
    cursor = pageInfo.endCursor;
  }
  return prs;
}

const FRESH_MS = 5 * 60 * 1000;
const pending = new Map();

export async function getPullRequests(user) {
  if (process.env.MOCK === 'true') return mockPrs();
  const snapshot = await PrSnapshot.findOne({ githubId: user.githubId }).lean();
  if (snapshot && Date.now() - snapshot.fetchedAt.getTime() < FRESH_MS) return snapshot.prs;
  if (!pending.has(user.githubId)) {
    const load = fetchAll(user)
      .then(async (prs) => {
        await PrSnapshot.updateOne({ githubId: user.githubId }, { prs, fetchedAt: new Date() }, { upsert: true });
        return prs;
      })
      .finally(() => pending.delete(user.githubId));
    pending.set(user.githubId, load);
  }
  return pending.get(user.githubId);
}
