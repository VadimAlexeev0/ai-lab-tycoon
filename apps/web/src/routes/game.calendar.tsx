import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";

import GamePage from "@/game/components/game-page";
import SimulationCalendar, {
	type CalendarEvent,
} from "@/game/components/simulation-calendar";
import { useRunState } from "@/game/game-state-context";

export const Route = createFileRoute("/game/calendar")({
	head: () => ({
		meta: [
			{ title: "Simulation calendar · AI Startup Lab Tycoon" },
			{
				name: "description",
				content:
					"Scan weekly simulation spans, indicative day placement, completed work, and pending decisions from the live engine state.",
			},
		],
	}),
	component: CalendarRoute,
});

function CalendarRoute() {
	const game = useRunState();
	const navigate = useNavigate();
	if (game.state === null) return null;

	function openCalendarDestination(event: CalendarEvent) {
		if (event.pendingDecisionId !== undefined) {
			void navigate({
				to: "/game",
				search: { decision: event.pendingDecisionId },
			});
			return;
		}
		if (event.destination !== undefined) {
			void navigate({ to: event.destination });
		}
	}

	return (
		<GamePage
			title="Simulation calendar"
			description="Scan weekly simulation spans, indicative day placement, completed work, and pending decisions from the live engine state."
			headerVisual={
				<CalendarDays
					aria-hidden="true"
					className="size-7 text-primary sm:size-8"
				/>
			}
		>
			<SimulationCalendar
			onNavigate={openCalendarDestination}
			state={game.state}
			/>
		</GamePage>
	);
}
