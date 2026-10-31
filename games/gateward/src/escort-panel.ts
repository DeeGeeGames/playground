import { craftCount, replaceFighters, type State } from './simulation';

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
				const replacement = document.createElement('button'); replacement.type = 'button';
				if (wing) { node.append(replacement); replacement.addEventListener('click', function () { if (active()) replaceFighters(getState(), unit.id); }, { signal }); }
				root.append(node);
				rows.set(key, { node, update: function () {
					const current = getState();
					const reason = !active() ? 'Commands held' : '';
					status.textContent = wing ? `Wing ${unit.id} · ${unit.phase} ${Math.ceil(unit.timer)}s · ${unit.craft.length}/3${(unit.phase === 'ready' || unit.phase === 'rearming') && unit.craft.length < 3 ? ' · replacements available' : ''}${reason ? ' · ' + reason : ''}` : `Guardian ${unit.id} · ${unit.sector ?? 'holding'} · automatic coverage`;
					if (wing) {
						const missing = 3 - unit.craft.length; const cost = missing * 30;
						const why = !active() ? 'Commands held' : unit.phase !== 'ready' && unit.phase !== 'rearming' ? 'Wait for rearm' : !missing ? 'Full strength' : current.salvage < cost ? 'Insufficient salvage' : craftCount(current) + missing > 9 ? 'No capacity' : '';
						replacement.textContent = `Replace · ${cost}${why ? ' · ' + why : ''}`; replacement.disabled = !!why;
					}
				} });
			}
		}
		for (const [key, row] of rows) { if (!live.has(key)) { row.node.remove(); rows.delete(key); } else row.update(); }
	};
};
