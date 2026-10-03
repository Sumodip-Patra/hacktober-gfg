import mongoose from 'mongoose';

export const connectDb = () => mongoose.connect(process.env.MONGODB_URI);

export const PrSnapshot = mongoose.model(
  'PrSnapshot',
  new mongoose.Schema({
    githubId: { type: String, required: true, unique: true },
    prs: { type: Array, default: [] },
    fetchedAt: { type: Date, required: true },
  }),
);
