import { CAMPAIGN_MISSIONS, MAX_HULL, chooseRefit, createCampaignState, type State } from './simulation';

export const CAMPAIGN_SAVE_KEY = 'dreadwake.campaign.v1';
export interface CampaignSave {
	version: 1;
	wave: number;
	phase: 'combat' | 'refit';
	hull: number;
	rails: number;
	capacitor: number;
	time: number;
	kills: number;
	automatic: boolean;
	stats: State['stats'];
}
type CampaignStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const record = function (value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};
const number = function (value: unknown, min: number, max: number): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
};
const integer = function (value: unknown, min: number, max: number): value is number {
	return number(value, min, max) && Number.isInteger(value);
};
const parseSave = function (value: unknown): CampaignSave | undefined {
	if (!record(value) || value['version'] !== 1 || !integer(value['wave'], 1, CAMPAIGN_MISSIONS.length)
		|| (value['phase'] !== 'combat' && value['phase'] !== 'refit') || !number(value['hull'], Number.MIN_VALUE, MAX_HULL)
		|| !integer(value['rails'], 0, value['wave'] - 1) || !integer(value['capacitor'], 0, value['wave'] - 1)
		|| value['rails'] + value['capacitor'] > value['wave'] - 1 || !number(value['time'], 0, 360000)
		|| !integer(value['kills'], 0, 14) || typeof value['automatic'] !== 'boolean' || !record(value['stats'])) return undefined;
	if (value['phase'] === 'refit' && value['wave'] === CAMPAIGN_MISSIONS.length) return undefined;
	const completed = CAMPAIGN_MISSIONS.slice(0, value['wave'] - (value['phase'] === 'combat' ? 1 : 0))
		.reduce(function (total, mission) { return total + mission.enemies.length; }, 0);
	if (value['kills'] !== completed) return undefined;
	const stats = value['stats'];
	if (!integer(stats['salvos'], 0, 1000000) || !integer(stats['torpedoSalvos'], 0, 1000000)
		|| !integer(stats['interceptions'], 0, 1000000) || !integer(stats['hits'], 0, 10000000)
		|| !number(stats['damageBlocked'], 0, 100000000)) return undefined;
	return { version: 1, wave: value['wave'], phase: value['phase'], hull: value['hull'], rails: value['rails'],
		capacitor: value['capacitor'], time: value['time'], kills: value['kills'], automatic: value['automatic'],
		stats: { salvos: stats['salvos'], torpedoSalvos: stats['torpedoSalvos'], interceptions: stats['interceptions'], hits: stats['hits'], damageBlocked: stats['damageBlocked'] } };
};

// Capture at mission launch or at the refit screen, never during an engagement.
export const captureCampaign = function (state: State): CampaignSave | undefined {
	if (!state.campaign || state.outcome !== 'playing') return undefined;
	return parseSave({ version: 1, wave: state.wave, phase: state.campaign.phase, hull: state.player.hp,
		rails: state.campaign.upgrades.rails, capacitor: state.campaign.upgrades.capacitor,
		time: state.time, kills: state.kills, automatic: state.fireControl.automatic, stats: { ...state.stats } });
};
export const restoreCampaign = function (value: unknown): State | undefined {
	const save = parseSave(value); if (!save) return undefined;
	const state = createCampaignState(); const campaign = state.campaign;
	if (!campaign) return undefined;
	while (state.wave < save.wave) {
		campaign.phase = 'refit'; state.enemies = [];
		if (!chooseRefit(state, 'repair')) return undefined;
	}
	campaign.phase = save.phase; campaign.completedMissions = save.wave - (save.phase === 'combat' ? 1 : 0);
	campaign.upgrades = { rails: save.rails, capacitor: save.capacitor };
	state.player.hp = save.hull; state.time = save.time; state.kills = save.kills;
	state.stats = { ...save.stats }; state.fireControl.automatic = save.automatic; state.events = [];
	if (save.phase === 'refit') { state.enemies = []; state.intermission = 6; }
	return state;
};
export type CampaignRead = { status: 'saved'; state: State } | { status: 'empty' | 'invalid' | 'unavailable' };
export const readCampaign = function (storage?: CampaignStorage): CampaignRead {
	let raw: string | null;
	try { raw = (storage ?? localStorage).getItem(CAMPAIGN_SAVE_KEY); }
	catch { return { status: 'unavailable' }; }
	if (raw === null) return { status: 'empty' };
	if (raw.length > 10000) return { status: 'invalid' };
	try {
		const value: unknown = JSON.parse(raw);
		const state = restoreCampaign(value);
		return state ? { status: 'saved', state } : { status: 'invalid' };
	} catch { return { status: 'invalid' }; }
};
export const writeCampaign = function (state: State, storage?: CampaignStorage): boolean {
	const save = captureCampaign(state); if (!save) return false;
	try { (storage ?? localStorage).setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(save)); return true; }
	catch { return false; }
};
export const clearCampaign = function (storage?: CampaignStorage): boolean {
	try { (storage ?? localStorage).removeItem(CAMPAIGN_SAVE_KEY); return true; }
	catch { return false; }
};
