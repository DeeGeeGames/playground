import { MAX_HULL, notify, passagesFor, type State } from './simulation';

export const REFIT_SUPPORT_IDS = ['repair', 'salvage', 'shield'] as const;
export type RefitSupportId = typeof REFIT_SUPPORT_IDS[number];
export interface RefitSupportReceipt {
	readonly id: RefitSupportId;
	readonly hull: number;
	readonly salvage: number;
	readonly shield: number;
}
export const REFIT_SUPPORT = {
	repair: { name: 'Repair tender', description: 'Restore up to 100 extra ark hull.', amount: 100 },
	salvage: { name: 'Salvage requisition', description: 'Receive 80 extra salvage for weapons or ships.', amount: 80 },
	shield: { name: 'Shield recharge', description: 'Fully recharge the ark shield before launch.' },
} as const;

export const refitSupportReason = function (state: State, id: RefitSupportId): string {
	if (!state.convoy) return 'Support is available in convoy operations.';
	if (state.paused) return 'Resume before requesting support.';
	if (!state.focused) return 'Return to the command view.';
	if (state.status !== 'fitting' || state.wave <= 0 || state.wave >= passagesFor(state).length) return 'Support is available between passages.';
	const reports = state.convoy.reports;
	const report = reports?.[state.wave - 1];
	if (!report?.survived || reports?.length !== state.wave) return 'Complete a passage to receive support.';
	if (report.support) return `${REFIT_SUPPORT[report.support.id].name} already received for this refit.`;
	if (id === 'repair' && state.hull >= MAX_HULL) return 'Ark hull is already fully repaired.';
	if (id === 'shield' && state.systems.shield.charge >= state.systems.shield.capacity) return 'Ark shield is already fully charged.';
	return '';
};

export const chooseRefitSupport = function (state: State, id: RefitSupportId): boolean {
	if (refitSupportReason(state, id)) return false;
	const report = state.convoy?.reports?.[state.wave - 1];
	if (!report) return false;
	const hull = id === 'repair' ? Math.min(REFIT_SUPPORT.repair.amount, MAX_HULL - state.hull) : 0;
	const salvage = id === 'salvage' ? REFIT_SUPPORT.salvage.amount : 0;
	const shield = id === 'shield' ? state.systems.shield.capacity - state.systems.shield.charge : 0;
	state.hull += hull;
	state.salvage += salvage;
	state.systems.shield.charge += shield;
	if (id === 'shield') state.systems.shield.rechargeDelay = 0;
	report.support = { id, hull, salvage, shield };
	notify(state, `${REFIT_SUPPORT[id].name} received. ${id === 'repair' ? `+${Math.ceil(hull)} ark hull` : id === 'salvage' ? `+${salvage} salvage` : 'Ark shield fully charged'}.`);
	return true;
};
