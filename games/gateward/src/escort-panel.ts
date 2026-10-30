import { assignGuardian, craftCount, distance, replaceFighters, scramble, scrambleReason, SECTOR_POINTS, SECTORS, type State } from './simulation';

// Stable controls retain keyboard focus while labels and availability update.
export const createEscortPanel = function (root: HTMLElement, getState: () => State, active: () => boolean, signal: AbortSignal) {
	const rows = new Map<string, { node: HTMLElement; update: () => void }>();
	let previous = getState();
	return function () {
		if (previous !== getState()) { for (const row of rows.values()) row.node.remove(); rows.clear(); previous = getState(); }
		const state = getState(); root.hidden = !state.experimental;
		const live = new Set<string>();
		for (const unit of [...state.wings, ...state.escorts.filter(function (e) { return e.kind === 'guardian'; })]) {
			const wing = 'phase' in unit; const key = `${wing ? 'wing' : 'guardian'}-${unit.id}`; live.add(key);
			if (!rows.has(key)) {
				const node = document.createElement('fieldset'); const status = document.createElement('legend'); node.append(status);
				const controls = SECTORS.map(function (sector) {
					const control = document.createElement('button'); control.type = 'button'; control.textContent = sector;
					control.addEventListener('click', function () { if (active()) { if (wing) scramble(getState(), unit.id, sector); else assignGuardian(getState(), unit.id, sector); } }, { signal });
					node.append(control); return { control, sector };
				});
				const replacement = document.createElement('button'); replacement.type = 'button';
				if (wing) { node.append(replacement); replacement.addEventListener('click', function () { if (active()) replaceFighters(getState(), unit.id); }, { signal }); }
				root.append(node);
				rows.set(key, { node, update: function () {
					const current = getState();
					const reason = !active() ? 'Commands held' : wing ? scrambleReason(current, unit) : '';
					status.textContent = wing ? `Wing ${unit.id} · ${unit.phase} ${Math.ceil(unit.timer)}s · ${unit.craft.length}/3 · ${unit.assignment}${reason ? ' · ' + reason : ''}` : `Guardian ${unit.id} · ${unit.sector} · ${distance(unit, SECTOR_POINTS[unit.sector ?? 'port']) > 50 ? 'repositioning' : 'screening'}${reason ? ' · ' + reason : ''}`;
					for (const { control, sector } of controls) {
						control.disabled = !!reason || (!wing && unit.sector === sector);
						control.setAttribute('aria-label', `${wing ? 'Scramble wing' : 'Assign guardian'} ${unit.id} ${sector}`);
						control.setAttribute('aria-pressed', String((wing ? unit.assignment : unit.sector) === sector));
					}
					if (wing) {
						const missing = 3 - unit.craft.length; const cost = missing * 30;
						const why = !active() ? 'Commands held' : unit.phase !== 'ready' ? 'Wait for ready' : !missing ? 'Full strength' : current.salvage < cost ? 'Insufficient salvage' : craftCount(current) + missing > 9 ? 'No capacity' : '';
						replacement.textContent = `Replace · ${cost}${why ? ' · ' + why : ''}`; replacement.disabled = !!why;
					}
				} });
			}
		}
		for (const [key, row] of rows) { if (!live.has(key)) { row.node.remove(); rows.delete(key); } else row.update(); }
	};
};
