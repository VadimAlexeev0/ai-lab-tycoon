import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";

import { gameSaveRouter } from "./game-save";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	gameSave: gameSaveRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
