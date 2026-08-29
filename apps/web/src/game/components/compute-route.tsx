import ComputePage from "@/game/components/compute-page";
import GamePage from "@/game/components/game-page";
import { useRunState } from "@/game/game-state-context";

const COMPUTE_PAGE_DESCRIPTION =
	"Monitor capacity, map live reservations, procure permanent compute, and respond before serving pressure pauses growth.";

export default function ComputeRoute() {
	const game = useRunState();
	if (game.state === null) return null;

	return (
		<GamePage description={COMPUTE_PAGE_DESCRIPTION} title="Compute grid">
			<ComputePage state={game.state} />
		</GamePage>
	);
}
