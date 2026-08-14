import type { DB } from './db/index.js';
import type { Scheduler } from './monitor/scheduler.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: DB;
    scheduler: Scheduler;
  }
}

export {};
