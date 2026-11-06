import type { Difficulty } from './operation';
export interface Settings {
	master: number;
	music: number;
	effects: number;
	reducedMotion: boolean;
	touchControls: boolean;
	difficulty: Difficulty;
}
export interface OperationRecord {
	difficulty: Difficulty;
	won: boolean;
	score: number;
	rank: string;
	kills: number;
	wave: number;
	time: number;
	relay: number;
}
export interface Profile { settings: Settings; records: OperationRecord[]; bests: OperationRecord[] }
const STORAGE_KEY = 'iron-wake:profile:v1';
export const defaultSettings = function (): Settings {
	return { master: 0.8, music: 0.55, effects: 0.85, reducedMotion: false, touchControls: false, difficulty: 'standard' };
};
export const isDifficulty = function (value: unknown): value is Difficulty { return value === 'story' || value === 'standard' || value === 'veteran'; };
const object = function (value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); };
const bounded = function (value: unknown, fallback: number, max = 1) { return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : fallback; };
const isRecord = function (value: unknown): value is OperationRecord {
	if (!object(value)) return false;
	return isDifficulty(value['difficulty']) && typeof value['won'] === 'boolean' && typeof value['rank'] === 'string' && value['rank'].length < 32
		&& ['score', 'kills', 'wave', 'time', 'relay'].every(function (key) { const number = value[key]; return typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1e9; });
};
const bestRecords = function (records: readonly OperationRecord[]): OperationRecord[] {
	return (['story', 'standard', 'veteran'] as const).flatMap(function (difficulty) {
		const best = records.filter(function (record) { return record.difficulty === difficulty; }).sort(function (a, b) { return b.score - a.score; })[0];
		return best ? [best] : [];
	});
};
export const addOperationRecord = function (profile: Profile, record: OperationRecord): Profile {
	return { settings: profile.settings, records: [record, ...profile.records].slice(0, 8), bests: bestRecords([record, ...profile.bests]) };
};
export const parseProfile = function (raw: string | null): Profile {
	const defaults: Profile = { settings: defaultSettings(), records: [], bests: [] };
	if (!raw) return defaults;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!object(parsed)) return defaults;
		const settings = parsed['settings'];
		if (object(settings)) defaults.settings = {
			master: bounded(settings['master'], defaults.settings.master), music: bounded(settings['music'], defaults.settings.music), effects: bounded(settings['effects'], defaults.settings.effects),
			reducedMotion: settings['reducedMotion'] === true, touchControls: settings['touchControls'] === true,
			difficulty: isDifficulty(settings['difficulty']) ? settings['difficulty'] : 'standard',
		};
		const records = parsed['records'];
		if (Array.isArray(records)) defaults.records = records.filter(isRecord).slice(0, 8);
		const bests = parsed['bests'];
		const candidates = [...defaults.records, ...(Array.isArray(bests) ? bests.filter(isRecord) : [])];
		defaults.bests = bestRecords(candidates);
		return defaults;
	} catch { return defaults; }
};
export const readProfile = function (): Profile {
	try { return parseProfile(localStorage.getItem(STORAGE_KEY)); } catch { return parseProfile(null); }
};
export const saveProfile = function (profile: Profile): boolean {
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); return true; } catch { return false; }
};
