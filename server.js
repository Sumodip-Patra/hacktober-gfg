import express from 'express';
import cors from 'cors';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import passport from 'passport';
import apiRoutes from './routes/api.js';
import authRoutes from './routes/auth.js';
import { connectDb } from './lib/db.js';
import { errorHandler } from './lib/errors.js';

const mock = process.env.MOCK === 'true';
if (!mock) await connectDb();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));

if (!mock) {
  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true },
      store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        crypto: { secret: process.env.SESSION_SECRET },
      }),
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
  app.use('/api/auth', authRoutes);
}

app.use('/api', apiRoutes);
app.use(errorHandler);
app.listen(process.env.PORT ?? 3000);
