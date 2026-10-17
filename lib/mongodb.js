import mongoose from 'mongoose';

const cache = globalThis.__mongooseCache || (globalThis.__mongooseCache = { connection: null, promise: null });

export default async function connectDB() {
  if (cache.connection) return cache.connection;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (!cache.promise) {
    cache.promise = mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false, maxPoolSize: 5, serverSelectionTimeoutMS: 10000
    }).catch((error) => { cache.promise = null; throw error; });
  }
  cache.connection = await cache.promise;
  return cache.connection;
}
