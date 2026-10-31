import type { Point, State } from './simulation';

export const SENSOR_CONFIG = {
	maxIntegrity: 100,
	shortRange: 700,
	healthyThreshold: 50,
	healthyDetectionRange: 2000,
	healthyClassificationRange: 640,
	impairedDetectionRange: 1000,
	impairedClassificationRange: 230,
	localDefenseRange: 200,
	damagePerBomberHit: 35,
	repairCost: 70,
	repairCooldown: 18,
} as const;

export const sensorRanges = function (state: State): { detection: number; classification: number } {
	const sensors = state.systems.sensors;
	if (sensors.integrity <= 0) return { detection: SENSOR_CONFIG.localDefenseRange, classification: 0 };
	return sensors.integrity >= SENSOR_CONFIG.healthyThreshold
		? { detection: SENSOR_CONFIG.healthyDetectionRange, classification: SENSOR_CONFIG.healthyClassificationRange }
		: { detection: SENSOR_CONFIG.impairedDetectionRange, classification: SENSOR_CONFIG.impairedClassificationRange };
};

export const contactIntel = function (state: State, point: Point): 'unseen' | 'detected' | 'classified' {
	const range = Math.hypot(point.x - state.ark.x, point.y - state.ark.y);
	const ranges = sensorRanges(state);
	if (range > ranges.detection) return 'unseen';
	return state.systems.sensors.integrity > 0 && range <= ranges.classification ? 'classified' : 'detected';
};

export const canAcquire = function (state: State, point: Point): boolean {
	return contactIntel(state, point) !== 'unseen';
};
