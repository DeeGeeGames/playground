import { arrangePlatform, build, notify, WEAPONS, type Formation, type State, type Weapon } from './simulation';

export const DOCTRINE_IDS = ['balanced', 'broadside', 'spearhead'] as const;
export type DoctrineId = typeof DOCTRINE_IDS[number];
interface Doctrine {
	readonly name: string;
	readonly description: string;
	readonly loadout: string;
	readonly cost: number;
	readonly weapons: readonly { readonly mount: number; readonly weapon: Weapon }[];
	readonly formation: readonly { readonly platform: number; readonly slot: Formation }[];
}
const doctrine = function (definition: Omit<Doctrine, 'cost'>): Doctrine {
	return { ...definition, cost: definition.weapons.reduce(function (sum, fit) { return sum + WEAPONS[fit.weapon].cost; }, 0) };
};
export const DOCTRINES = {
	balanced: doctrine({
		name: 'Balanced screen', description: 'Mixed weapons cover both flanks. A flexible first convoy with salvage left for your own changes.',
		loadout: '2 railguns · 2 flak · 1 beam · frigates on opposite flanks',
		weapons: [{ mount: 2, weapon: 'rail' }, { mount: 6, weapon: 'rail' }, { mount: 8, weapon: 'flak' }, { mount: 9, weapon: 'beam' }, { mount: 10, weapon: 'flak' }],
		formation: [{ platform: 0, slot: 'port' }, { platform: 1, slot: 'starboard' }],
	}),
	broadside: doctrine({
		name: 'Iron broadside', description: 'Four ark railguns punish armored ships alongside. Flak frigates screen the flanks; the bow is less protected.',
		loadout: '4 railguns · 2 flak · frigates on opposite flanks',
		weapons: [{ mount: 0, weapon: 'rail' }, { mount: 2, weapon: 'rail' }, { mount: 4, weapon: 'rail' }, { mount: 6, weapon: 'rail' }, { mount: 8, weapon: 'flak' }, { mount: 10, weapon: 'flak' }],
		formation: [{ platform: 0, slot: 'port' }, { platform: 1, slot: 'starboard' }],
	}),
	spearhead: doctrine({
		name: 'Forward spearhead', description: 'Both frigates meet incoming threats ahead of the ark. Strong opening fire, but the forward ships are exposed.',
		loadout: '2 railguns · 3 flak · 1 missile · both frigates forward',
		weapons: [{ mount: 8, weapon: 'rail' }, { mount: 9, weapon: 'rail' }, { mount: 10, weapon: 'missile' }, { mount: 11, weapon: 'flak' }, { mount: 2, weapon: 'flak' }, { mount: 6, weapon: 'flak' }],
		formation: [{ platform: 0, slot: 'inner-fore-port' }, { platform: 1, slot: 'ahead' }],
	}),
} satisfies Record<DoctrineId, Doctrine>;

export const doctrineReason = function (state: State, id: DoctrineId): string {
	const convoy = state.convoy;
	if (!convoy) return 'Starting doctrines are available in convoy operations.';
	if (state.paused) return 'Resume before fitting a doctrine.';
	if (!state.focused) return 'Return to the command view.';
	if (state.status !== 'fitting' || state.wave !== 0 || state.time !== 0) return 'Choose a doctrine before the first passage.';
	if (convoy.doctrine || convoy.initialFitChanged || state.orders > 0 || state.systems.powerChanges > 0) return 'Your convoy is customized. Refit individual guns or restart to choose a doctrine.';
	if (state.salvage < DOCTRINES[id].cost) return `Need ${DOCTRINES[id].cost} salvage.`;
	if (state.salvage !== 650 || state.mounts.length !== 12 || state.mounts.some(function (mount) { return mount.weapon !== undefined || mount.level !== 0 || mount.integrity !== 100; })
		|| state.escorts.length > 0 || state.wings.length > 0 || convoy.platforms.length !== 2
		|| !convoy.platforms.some(function (platform) { return platform.id === 0 && platform.slot === 'port' && platform.hull === 'frigate' && platform.hp === 240; })
		|| !convoy.platforms.some(function (platform) { return platform.id === 1 && platform.slot === 'astern' && platform.hull === 'frigate' && platform.hp === 240; })) {
		return 'Doctrines require the untouched starting convoy.';
	}
	return '';
};

// Validate all normal fitting orders on an isolated candidate before committing
// the purchased equipment, formation and exact cost together.
export const applyDoctrine = function (state: State, id: DoctrineId): boolean {
	if (doctrineReason(state, id)) return false;
	const convoy = state.convoy;
	if (!convoy) return false;
	const candidate = structuredClone(state);
	const fitted = candidate.convoy;
	if (!fitted) return false;
	for (const fit of DOCTRINES[id].weapons) if (!build(candidate, fit.mount, fit.weapon)) return false;
	for (const formation of DOCTRINES[id].formation) {
		const platform = fitted.platforms.find(function (platform) { return platform.id === formation.platform; });
		if (!platform) return false;
		if (platform.slot !== formation.slot && !arrangePlatform(candidate, platform.id, formation.slot)) return false;
	}
	state.mounts = candidate.mounts;
	state.salvage = candidate.salvage;
	convoy.platforms = fitted.platforms;
	convoy.doctrine = id;
	convoy.initialFitChanged = true;
	notify(state, `${DOCTRINES[id].name} fitted. ${state.salvage} salvage remains. Every weapon can still be refitted for a full refund.`);
	return true;
};
