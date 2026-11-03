import { fleetShips, type FleetFocus } from './fleet-focus';
import type { State } from './simulation';

export const createFleetPanel = function (root: HTMLElement, getState: () => State, active: () => boolean, getFocus: () => FleetFocus, focus: (id: FleetFocus) => void, signal: AbortSignal) {
	const status = document.createElement('p'); status.className = 'note'; status.setAttribute('role', 'status');
	const help = document.createElement('p'); help.className = 'note'; help.textContent = 'Follow any ship while keeping your orbit and zoom. Docked fighters follow the ark until launch. If a ship is lost, the view returns to the ark.';
	const list = document.createElement('div'); list.className = 'fleet-list'; list.setAttribute('aria-label', 'Focus fleet ship');
	root.append(status, help, list);
	const rows = new Map<FleetFocus, { control: HTMLButtonElement; name: HTMLElement; detail: HTMLElement }>();
	return function () {
		const ships = fleetShips(getState()); const selected = getFocus();
		const live = new Set(ships.map(function (ship) { return ship.id; }));
		for (const [id, row] of rows) if (!live.has(id)) {
			const heldFocus = row.control === document.activeElement;
			row.control.remove(); rows.delete(id);
			if (heldFocus) rows.get(selected)?.control.focus({ preventScroll: true });
		}
		for (const ship of ships) {
			let row = rows.get(ship.id);
			if (!row) {
				const control = document.createElement('button'); control.type = 'button';
				const name = document.createElement('b'); const detail = document.createElement('small');
				control.append(name, detail); list.append(control);
				control.addEventListener('click', function () { if (active()) focus(ship.id); }, { signal });
				row = { control, name, detail }; rows.set(ship.id, row);
			}
			if (row.name.textContent !== ship.name) row.name.textContent = ship.name;
			if (row.detail.textContent !== ship.detail) row.detail.textContent = ship.detail;
			row.control.disabled = !active(); row.control.setAttribute('aria-pressed', String(ship.id === selected));
			row.control.setAttribute('aria-label', `Focus ${ship.name}, ${ship.detail}`);
		}
		const text = `Following ${ships.find(function (ship) { return ship.id === selected; })?.name ?? 'Ark–07 / Gateward'}`;
		if (status.textContent !== text) status.textContent = text;
	};
};
