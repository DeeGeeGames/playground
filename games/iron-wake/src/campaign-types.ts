import type { Point } from './simulation';

export type FactionId = 'freeholds' | 'combine' | 'accord';
export type PlanetId = 'meridian' | 'cinder' | 'borealis';
export type Biome = 'badlands' | 'volcanic' | 'tundra';
export type MissionKind = 'defend' | 'demolition' | 'assassination' | 'clearance';

export interface Contract {
	id: string;
	seed: number;
	planetId: PlanetId;
	kind: MissionKind;
	employer: FactionId;
	opponent: FactionId;
	title: string;
	briefing: string;
	reward: number;
	favor: number;
	hostility: number;
	tier: number;
	requiredReputation: number;
}

export interface Landmark extends Point {
	kind: 'rocks' | 'depot' | 'crater';
	radius: number;
	rotation: number;
}

export interface MissionMap {
	seed: number;
	biome: Biome;
	width: number;
	height: number;
	drop: Point;
	objective: Point;
	extraction: Point;
	sites: Point[];
	landmarks: Landmark[];
}

export interface MissionRuntime {
	contract: Contract;
	map: MissionMap;
	stage: 'active' | 'extract';
	structure: (Point & { hp: number; maxHp: number }) | undefined;
	targetId: number | undefined;
	progress: number;
	required: number;
	extractTime: number;
}
