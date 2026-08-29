import { createFileRoute } from "@tanstack/react-router";

import ComputeRoute from "@/game/components/compute-route";

const COMPUTE_PAGE_DESCRIPTION =
	"Monitor capacity, map live reservations, procure permanent compute, and respond before serving pressure pauses growth.";

export const Route = createFileRoute("/game/compute")({
	head: () => ({
		meta: [
			{ title: "Compute grid · AI Startup Lab Tycoon" },
			{
				name: "description",
				content: COMPUTE_PAGE_DESCRIPTION,
			},
		],
	}),
	component: ComputeRoute,
});
