import { CAMPAIGN_MISSIONS, MAX_HULL, chooseRefit, createArsenalCampaign, type State } from './simulation';
import { createArsenal, draftCost, MAX_DRAFTS } from './arsenal';
import { createMount, isWeaponId, isWeaponRank, MOUNT_SOCKETS, type WeaponId, type WeaponRank } from './weapons';

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
	arsenal?: ArsenalSave;
}
export interface ArsenalSave {
	version: 1;
	mounts: ({ weapon: WeaponId; rank: WeaponRank } | null)[];
	salvage: number;
	rewards: number;
	seed: number;
	legacy: boolean;
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
const parseArsenal = function (value: unknown): ArsenalSave | undefined {
	if (!record(value) || value['version'] !== 1 || !Array.isArray(value['mounts']) || value['mounts'].length !== MOUNT_SOCKETS.length
		|| !integer(value['rewards'], 0, MAX_DRAFTS) || !integer(value['seed'], 0, 0xffffffff)
		|| !number(value['salvage'], 0, 1000000) || typeof value['legacy'] !== 'boolean') return undefined;
	if (value['rewards'] < MAX_DRAFTS && value['salvage'] >= draftCost(value['rewards'])) return undefined;
	const mounts: ArsenalSave['mounts'] = [];
	for (const entry of value['mounts']) {
		if (entry === null) { mounts.push(null); continue; }
		if (!record(entry) || !isWeaponId(entry['weapon']) || !isWeaponRank(entry['rank'])) return undefined;
		mounts.push({ weapon: entry['weapon'], rank: entry['rank'] });
	}
	const investment = mounts.reduce(function (total, mount) { return total + (mount?.rank ?? 0); }, 0);
	if (investment === 0 || investment > (value['legacy'] ? 6 : 1) + value['rewards']) return undefined;
	return { version: 1, mounts, salvage: value['salvage'], rewards: value['rewards'], seed: value['seed'], legacy: value['legacy'] };
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
	const arsenal = value['arsenal'] === undefined ? undefined : parseArsenal(value['arsenal']);
	if (value['arsenal'] !== undefined && !arsenal) return undefined;
	return { version: 1, wave: value['wave'], phase: value['phase'], hull: value['hull'], rails: value['rails'],
		capacitor: value['capacitor'], time: value['time'], kills: value['kills'], automatic: value['automatic'],
		stats: { salvos: stats['salvos'], torpedoSalvos: stats['torpedoSalvos'], interceptions: stats['interceptions'], hits: stats['hits'], damageBlocked: stats['damageBlocked'] },
		...(arsenal ? { arsenal } : {}) };
};

// Capture at mission launch or at the refit screen, never during an engagement.
export const captureCampaign = function (state: State): CampaignSave | undefined {
	if (!state.campaign || state.outcome !== 'playing') return undefined;
	const arsenal = state.arsenal;
	if (arsenal && (arsenal.pending > 0 || (state.campaign.phase === 'combat' &&
		(state.shells.length > 0 || state.enemies.some(function (enemy) { return enemy.hp !== enemy.maxHp; }))))) return undefined;
	return parseSave({ version: 1, wave: state.wave, phase: state.campaign.phase, hull: state.player.hp,
		rails: state.campaign.upgrades.rails, capacitor: state.campaign.upgrades.capacitor,
		time: state.time, kills: state.kills, automatic: state.fireControl.automatic, stats: { ...state.stats },
		...(arsenal ? { arsenal: { version: 1, mounts: arsenal.mounts.map(function (mount) { return mount ? { weapon: mount.weapon, rank: mount.rank } : null; }),
			salvage: arsenal.salvage, rewards: arsenal.rewards, seed: arsenal.seed, legacy: arsenal.legacy ?? false } } : {}) });
};
export const restoreCampaign = function (value: unknown): State | undefined {
	const save = parseSave(value); if (!save) return undefined;
	const state = createArsenalCampaign(); const campaign = state.campaign;
	if (!campaign) return undefined;
	// A legacy checkpoint keeps its route and investments; the declared fit maps
	// its old rail banks, missile rack, lance, torpedoes and defensive screen.
	const arsenal = createArsenal(save.arsenal?.seed ?? 0x4c595241);
	arsenal.legacy = save.arsenal?.legacy ?? true;
	if (save.arsenal) {
		arsenal.mounts = save.arsenal.mounts.map(function (mount, slot) { return mount ? createMount(slot, mount.weapon, mount.rank, state.player.angle) : null; });
		arsenal.salvage = save.arsenal.salvage; arsenal.rewards = save.arsenal.rewards;
	} else {
		for (const [slot, weapon] of [[0, 'torpedo'], [1, 'rail'], [2, 'seeker'], [6, 'helios'], [7, 'rail'], [8, 'flak']] as const) {
			arsenal.mounts[slot] = createMount(slot, weapon, 1, state.player.angle);
		}
	}
	state.arsenal = arsenal;
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
