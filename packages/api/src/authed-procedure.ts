import { ORPCError } from "@orpc/server";

import { o } from "./index";

/**
 * Authenticated oRPC procedure. Rejects calls with no resolved session (401)
 * before the handler runs; every authed handler can assume `context.user` is
 * set. Kept in its own module so routers import it without a cycle.
 */
export const authedProcedure = o.use(async ({ context, next }) => {
	const user = context.user;
	if (user === undefined || user === null) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({ context: { ...context, user } });
});
