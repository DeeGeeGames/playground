// Combat time only; paused choices never consume the survival window.
export const MISSION_PACING = [
	{ duration: 60, interval: 12, activeLimit: 3, salvageBudget: 720 },
	{ duration: 75, interval: 12, activeLimit: 4, salvageBudget: 2160 },
	{ duration: 90, interval: 15, activeLimit: 4, salvageBudget: 2840 },
	{ duration: 90, interval: 15, activeLimit: 4, salvageBudget: 2800 },
	{ duration: 90, interval: 15, activeLimit: 5, salvageBudget: 5240 },
] as const;
export interface MissionClock { elapsed: number; reinforcement: number; salvageEarned: number }
export const createMissionClock = function (): MissionClock {
	return { elapsed: 0, reinforcement: 1, salvageEarned: 0 };
};
