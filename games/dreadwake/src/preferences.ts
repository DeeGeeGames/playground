export interface Preferences { master: number; music: number; effects: number; shake: boolean; vibration: boolean; largeHud: boolean }
const defaults: Preferences = { master: 0.75, music: 0.55, effects: 0.8, shake: true, vibration: true, largeHud: false };
const key = 'dreadwake.preferences.v1';
export const readPreferences = function (): Preferences {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
		if (typeof value !== 'object' || value === null) return { ...defaults };
		const fraction = function (input: unknown, fallback: number) { return typeof input === 'number' && Number.isFinite(input) ? Math.min(1, Math.max(0, input)) : fallback; };
		return {
			master: fraction('master' in value ? value.master : undefined, defaults.master),
			music: fraction('music' in value ? value.music : undefined, defaults.music),
			effects: fraction('effects' in value ? value.effects : undefined, defaults.effects),
			shake: 'shake' in value && typeof value.shake === 'boolean' ? value.shake : defaults.shake,
			vibration: 'vibration' in value && typeof value.vibration === 'boolean' ? value.vibration : defaults.vibration,
			largeHud: 'largeHud' in value && typeof value.largeHud === 'boolean' ? value.largeHud : defaults.largeHud,
		};
	} catch { return { ...defaults }; }
};
export const writePreferences = function (value: Preferences): boolean {
	try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
};
