import { arrangePlatform, constructPlatform, constructionCostRequirement, type State } from './simulation';
import { FORMATION, FORMATION_SLOTS, HULLS, type Formation } from './formation';

export const createShipyardPanel = function (root: HTMLElement, getState: () => State, active: () => boolean, order: (action: () => boolean) => void, selectMount: (index: number) => void, signal: AbortSignal) {
	const position = document.createElement('select'); position.setAttribute('aria-label', 'Construction position');
	const heading = document.createElement('label'); heading.textContent = 'Construction position'; heading.append(position);
	for (const slot of FORMATION) {
		const option = document.createElement('option'); option.value = slot; option.textContent = FORMATION_SLOTS[slot].label; position.append(option);
	}
	let selected: Formation = 'ahead'; position.value = selected;
	const summary = document.createElement('p'); summary.className = 'note'; summary.setAttribute('role', 'status');
	const choices = document.createElement('div'); choices.className = 'hull-choices';
	const hullButtons = Object.entries(HULLS).map(function ([kind, hull]) {
		const control = document.createElement('button'); control.type = 'button';
		control.textContent = `${hull.name} · ${hull.mounts} turret${hull.mounts === 1 ? '' : 's'} · ${hull.cost}`;
		control.addEventListener('click', function () {
			if (kind !== 'corvette' && kind !== 'frigate' && kind !== 'cruiser') return;
			order(function () {
				const state = getState(); const index = state.mounts.length;
				if (!constructPlatform(state, selected, kind)) return false;
				selectMount(index); return true;
			});
		}, { signal }); choices.append(control); return { control, hull, kind };
	});
	const fit = document.createElement('button'); fit.type = 'button'; fit.textContent = 'Fit this ship';
	fit.addEventListener('click', function () {
		if (!active()) return;
		const state = getState(); const platform = state.convoy?.platforms.find(function (p) { return p.slot === selected; });
		const index = state.mounts.findIndex(function (mount) { return platform && mount.platform === platform.id; });
		if (index >= 0) selectMount(index);
	}, { signal });
	const move = document.createElement('select'); move.setAttribute('aria-label', 'Move ship to position');
	for (const slot of FORMATION) { const option = document.createElement('option'); option.value = slot; option.textContent = FORMATION_SLOTS[slot].label; move.append(option); }
	const moveLabel = document.createElement('label'); moveLabel.textContent = 'Move / swap ship'; moveLabel.append(move);
	move.addEventListener('change', function () {
		const target = FORMATION.find(function (slot) { return slot === move.value; });
		const platform = getState().convoy?.platforms.find(function (p) { return p.slot === selected; });
		if (target && platform) order(function () { if (!arrangePlatform(getState(), platform.id, target)) return false; selected = target; position.value = target; return true; });
	}, { signal });
	position.addEventListener('change', function () { const slot = FORMATION.find(function (slot) { return slot === position.value; }); if (slot) selected = slot; }, { signal });
	const note = document.createElement('p'); note.className = 'note'; note.textContent = '6 inner + 8 middle positions available now. Any hull fits any position. Outer ring: future expansion. Hull purchases are permanent; weapons receive full refunds. Keep 75 salvage for your first weapon.';
	root.append(heading, summary, choices, fit, moveLabel, note);
	return {
		select: function (slot: Formation) { selected = slot; position.value = slot; },
		selected: function () { return selected; },
		update: function () {
			const state = getState(); const platform = state.convoy?.platforms.find(function (p) { return p.slot === selected; });
			const enabled = active() && state.status === 'fitting';
			position.disabled = !enabled;
			for (const option of position.options) {
				const slot = FORMATION.find(function (slot) { return slot === option.value; }); if (!slot) continue;
				const occupant = state.convoy?.platforms.find(function (p) { return p.slot === slot; });
				const text = `${FORMATION_SLOTS[slot].label} · ${occupant ? `P${occupant.id + 1} ${HULLS[occupant.hull].name}` : 'empty'}`;
				if (option.textContent !== text) option.textContent = text;
			}
			const text = platform ? `P${platform.id + 1} ${HULLS[platform.hull].name} · ${Math.ceil(platform.hp)}/${HULLS[platform.hull].hp} hull · ${HULLS[platform.hull].mounts} turrets` : 'Empty position · Build a hull, then fit its turrets separately.';
			if (summary.textContent !== text) summary.textContent = text;
			choices.hidden = !!platform; fit.hidden = !platform; moveLabel.hidden = !platform;
			fit.disabled = !active() || !platform || platform.hp <= 0;
			move.disabled = !enabled; move.value = selected;
			for (const { control, hull, kind } of hullButtons) {
				if (kind !== 'corvette' && kind !== 'frigate' && kind !== 'cruiser') continue;
				const required = constructionCostRequirement(state, kind);
				control.disabled = !enabled || !!platform || state.salvage < required;
				control.title = state.salvage < required ? `Need ${required} salvage${required > hull.cost ? ' (includes 75 reserved for your first weapon)' : ''}` : 'Build hull; weapons cost extra';
			}
		},
	};
};
