import { env } from "@ai-lab-tycoon/env/server";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

// Re-export the Drizzle operators so consumers share the exact drizzle-orm
// instance this package compiled against (avoids dual-instance type drift).
export { and, desc, eq, sql } from "drizzle-orm";
export type {
	Account,
	NewRun,
	Run,
	RunEvent,
	Session,
	User,
	Verification,
} from "./schema";
export {
	account,
	runEvents,
	runs,
	session,
	user,
	verification,
} from "./schema";

export function createDb() {
	return drizzle(env.DB, { schema });
}

export type AppDatabase = ReturnType<typeof createDb>;
