import { Router } from 'express';
import passport from 'passport';
import '../lib/auth.js';

const router = Router();
const frontend = process.env.FRONTEND_URL;

function safeRedirect(url) {
  try {
    return new URL(url).origin === new URL(frontend).origin ? url : frontend;
  } catch {
    return frontend;
  }
}

router.get('/github', (req, res, next) => {
  req.session.redirect = safeRedirect(req.query.redirect);
  passport.authenticate('github')(req, res, next);
});

router.get(
  '/github/callback',
  passport.authenticate('github', { failureRedirect: frontend, keepSessionInfo: true }),
  (req, res) => res.redirect(req.session.redirect ?? frontend),
);

router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.sendStatus(204));
  });
});

export default router;
