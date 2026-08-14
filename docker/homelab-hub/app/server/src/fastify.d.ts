import type { DB } from './db/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: DB;
  }
}

export {};
