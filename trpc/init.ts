// trpc/init.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure;