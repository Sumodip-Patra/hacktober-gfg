import passport from 'passport';
import GitHub from 'passport-github2';
import { ApiError } from './errors.js';
import { mockUser } from './mock.js';

if (process.env.MOCK !== 'true') {
  passport.use(
    new GitHub.Strategy(
      {
        clientID: process.env.GITHUB_ID,
        clientSecret: process.env.GITHUB_SECRET,
        callbackURL: `${process.env.BACKEND_URL}/api/auth/github/callback`,
        scope: ['read:user'],
      },
      (accessToken, refreshToken, profile, done) =>
        done(null, {
          githubId: profile.id,
          username: profile.username,
          avatarUrl: profile.photos?.[0]?.value,
          accessToken,
        }),
    ),
  );
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

export function getUser(req) {
  if (process.env.MOCK === 'true') return mockUser;
  if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in.');
  return req.user;
}
