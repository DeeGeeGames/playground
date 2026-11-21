// Combat time only; paused choices never consume the survival window.
export const MISSION_PACING = [
	{ duration: 60, interval: 12, activeLimit: 3 },
	{ duration: 75, interval: 12, activeLimit: 4 },
	{ duration: 90, interval: 15, activeLimit: 4 },
	{ duration: 90, interval: 15, activeLimit: 4 },
	{ duration: 90, interval: 15, activeLimit: 5 },
] as const;
export interface MissionClock { elapsed: number; reinforcement: number }
export const createMissionClock = function (): MissionClock {
	return { elapsed: 0, reinforcement: 1 };
};
