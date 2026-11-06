import { MISSION_PACING } from './pacing';
import type { State } from './simulation';
import { createMount, MOUNT_SOCKETS, nextRank, WEAPON_IDS, type MountState, type WeaponId, type WeaponRank } from './weapons';
export { weaponSummary } from './weapons';

export type DraftOffer = { kind: 'install'; weapon: WeaponId } | { kind: 'upgrade'; slot: number; weapon: WeaponId; rank: WeaponRank };
export interface Arsenal {
	mounts: (MountState | null)[];
	salvage: number;
	rewards: number;
	pending: number;
	offers: DraftOffer[];
	rerolled: boolean;
	seed: number;
	legacy?: boolean;
}
export const MAX_DRAFTS = 14;
export const draftCost = function (rewards: number): number { return 180 + 100 * rewards; };
export const createArsenal = function (seed = Math.floor(Math.random() * 0x100000000)): Arsenal {
	return { mounts: MOUNT_SOCKETS.map(function () { return null; }), salvage: 0, rewards: 0, pending: 0, offers: [], rerolled: false, seed: seed >>> 0 };
};
const randomIndex = function (arsenal: Arsenal, length: number): number {
	arsenal.seed = (Math.imul(arsenal.seed, 1664525) + 1013904223) >>> 0;
	return Math.floor(arsenal.seed / 0x100000000 * length);
};
export const installStarter = function (state: State, weapon: WeaponId, slot: number): boolean {
	const arsenal = state.arsenal;
	if (!arsenal || !Number.isInteger(slot) || !MOUNT_SOCKETS[slot] || arsenal.mounts.some(function (mount) { return mount !== null; }) || arsenal.rewards !== 0) return false;
	arsenal.mounts[slot] = createMount(slot, weapon, 1, state.player.angle);
	state.fireControl.automatic = true;
	return true;
};
export const awardSalvage = function (state: State, damage: number) {
	const arsenal = state.arsenal;
	if (!arsenal || !state.campaign || state.outcome !== 'playing' || !Number.isFinite(damage) || damage <= 0 || arsenal.rewards >= MAX_DRAFTS) return;
	const clock = state.campaign.clock;
	const pacing = clock ? MISSION_PACING[state.wave - 1] : undefined;
	const earned = clock && pacing ? Math.min(damage, Math.max(0, pacing.salvageBudget - clock.salvageEarned)) : damage;
	if (clock) clock.salvageEarned += earned;
	arsenal.salvage += earned;
	while (arsenal.rewards < MAX_DRAFTS && arsenal.salvage >= draftCost(arsenal.rewards)) {
		arsenal.salvage -= draftCost(arsenal.rewards); arsenal.rewards++; arsenal.pending++;
	}
};
const makeOffers = function (arsenal: Arsenal, excluded: readonly WeaponId[] = []): DraftOffer[] {
	const upgrades: DraftOffer[] = arsenal.mounts.filter(function (mount): mount is MountState { return mount !== null && mount.rank < 3; })
		.sort(function (a, b) { return b.rank - a.rank || a.slot - b.slot; })
		.flatMap(function (mount): DraftOffer[] { const rank = nextRank(mount.rank); return rank ? [{ kind: 'upgrade', slot: mount.slot, weapon: mount.weapon, rank }] : []; });
	const pool = WEAPON_IDS.filter(function (id) { return !excluded.includes(id); });
	const choices: DraftOffer[] = [];
	const first = pool.splice(randomIndex(arsenal, pool.length), 1)[0];
	if (first) choices.push({ kind: 'install', weapon: first });
	const upgrade = upgrades[0]; if (upgrade) choices.push(upgrade);
	const alternate = upgrades[1];
	if (alternate && randomIndex(arsenal, 2) === 0) choices.push(alternate);
	while (choices.length < 3 && pool.length > 0) {
		const weapon = pool.splice(randomIndex(arsenal, pool.length), 1)[0];
		if (weapon) choices.push({ kind: 'install', weapon });
	}
	return choices;
};
export const prepareDraft = function (state: State) {
	const arsenal = state.arsenal;
	if (!arsenal || arsenal.pending <= 0 || arsenal.offers.length > 0 || state.outcome !== 'playing') return;
	arsenal.offers = makeOffers(arsenal); arsenal.rerolled = false;
};
const consumeReward = function (state: State) {
	const arsenal = state.arsenal; if (!arsenal) return;
	arsenal.pending--; arsenal.offers = []; arsenal.rerolled = false;
	prepareDraft(state);
};
export const applyDraft = function (state: State, offerIndex: number, slot?: number): boolean {
	const arsenal = state.arsenal;
	if (!arsenal || arsenal.pending <= 0 || state.outcome !== 'playing' || !Number.isInteger(offerIndex)) return false;
	const offer = arsenal.offers[offerIndex]; if (!offer) return false;
	if (offer.kind === 'upgrade') {
		const mount = arsenal.mounts[offer.slot];
		if (!mount || mount.weapon !== offer.weapon || nextRank(mount.rank) !== offer.rank) return false;
		mount.rank = offer.rank;
	} else {
		if (slot === undefined || !Number.isInteger(slot) || !MOUNT_SOCKETS[slot]) return false;
		arsenal.mounts[slot] = createMount(slot, offer.weapon, 1, state.player.angle);
	}
	consumeReward(state);
	return true;
};
export const rerollDraft = function (state: State): boolean {
	const arsenal = state.arsenal;
	if (!arsenal || arsenal.pending <= 0 || arsenal.rerolled || state.outcome !== 'playing') return false;
	const prior = arsenal.offers.flatMap(function (offer) { return offer.kind === 'install' ? [offer.weapon] : []; });
	arsenal.offers = makeOffers(arsenal, prior); arsenal.rerolled = true;
	return true;
};
export const resolveDraft = function (state: State, choice: 'repair' | 'skip'): boolean {
	const arsenal = state.arsenal;
	if (!arsenal || arsenal.pending <= 0 || state.outcome !== 'playing') return false;
	if (choice === 'repair') state.player.hp = Math.min(state.player.maxHp, state.player.hp + state.player.maxHp * 0.15);
	consumeReward(state);
	return true;
};
