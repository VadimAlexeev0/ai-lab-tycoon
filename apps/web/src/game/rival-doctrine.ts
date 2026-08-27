export type RivalDoctrineId = "capability" | "efficiency";

export type RivalDoctrine = Readonly<{
	id: RivalDoctrineId;
	label: string;
	note: string;
}>;

export const RIVAL_DOCTRINES: Readonly<Record<RivalDoctrineId, RivalDoctrine>> =
	{
		capability: {
			id: "capability",
			label: "Cathedral of Compute",
			note: "Heavy Insight costs early; stronger late models.",
		},
		efficiency: {
			id: "efficiency",
			label: "Foundry of Efficiency",
			note: "Cheaper compute pressure; faster releases.",
		},
	};

/** Round-robin doctrine assignments for the three existing rival slots. */
export const RIVAL_DOCTRINE_BY_RIVAL_ID: Readonly<
	Record<"rival_001" | "rival_002" | "rival_003", RivalDoctrineId>
> = {
	rival_001: "capability",
	rival_002: "efficiency",
	rival_003: "capability",
};

export function rivalDoctrineForId(rivalId: string): RivalDoctrine {
	const doctrineId =
		RIVAL_DOCTRINE_BY_RIVAL_ID[
			rivalId as keyof typeof RIVAL_DOCTRINE_BY_RIVAL_ID
		] ?? "capability";
	return RIVAL_DOCTRINES[doctrineId];
}
