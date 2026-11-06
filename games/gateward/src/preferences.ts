export interface Preferences { readonly music: number; readonly effects: number; readonly muted: boolean; readonly reducedMotion: boolean }
const KEY = 'gateward.preferences.v1';
const DEFAULTS: Preferences = { music: 0.65, effects: 0.8, muted: false, reducedMotion: false };
const gain = function (value: unknown, fallback: number) { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback; };
export const readPreferences = function (): Preferences {
	try {
		const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
		if (!value || typeof value !== 'object') return DEFAULTS;
		return { music: gain('music' in value ? value.music : undefined, DEFAULTS.music), effects: gain('effects' in value ? value.effects : undefined, DEFAULTS.effects), muted: 'muted' in value && value.muted === true, reducedMotion: 'reducedMotion' in value && value.reducedMotion === true };
	} catch { return DEFAULTS; }
};
export const savePreferences = function (preferences: Preferences) {
	try { localStorage.setItem(KEY, JSON.stringify(preferences)); } catch { /* Settings remain usable when storage is unavailable. */ }
};
