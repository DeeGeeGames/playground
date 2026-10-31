import { tactical } from './combat-scale';
import type { Point, State } from './simulation';

export const SENSOR_CONFIG = {
	maxIntegrity: 100,
	shortRange: tactical(700),
	healthyThreshold: 50,
	healthyDetectionRange: tactical(2000),
	healthyClassificationRange: tactical(640),
	impairedDetectionRange: tactical(1000),
	impairedClassificationRange: tactical(230),
	localDefenseRange: tactical(200),
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
	const range = Math.hypot(point.x - state.ark.x, point.y - state.ark.y, point.z ?? 0);
	const ranges = sensorRanges(state);
	if (range > ranges.detection) return 'unseen';
	return state.systems.sensors.integrity > 0 && range <= ranges.classification ? 'classified' : 'detected';
};

export const canAcquire = function (state: State, point: Point): boolean {
	return contactIntel(state, point) !== 'unseen';
};
