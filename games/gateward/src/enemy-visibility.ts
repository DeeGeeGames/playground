import { sensorRanges } from './sensors';
import type { Point, State } from './simulation';

// Rendering reaches farther than gameplay sensors; this grants no firing solution.
export const enemyVisibility = function (state: State, point: Point): 'hidden' | 'marker' | 'model' {
	const range = Math.hypot(point.x - state.ark.x, point.y - state.ark.y, point.z ?? 0);
	const sensors = sensorRanges(state);
	if (range > sensors.detection * 2) return 'hidden';
	return state.systems.sensors.integrity > 0 && range <= sensors.classification * 2 ? 'model' : 'marker';
};
