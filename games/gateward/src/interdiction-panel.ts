import { fieldRelative, INTERDICTION_CONFIG } from './interdiction';
import { interdictionReason, type Point, type State } from './simulation';

interface Placement {
	get: () => Point | undefined;
	aim: (point: Point) => void;
	cancel: () => void;
	confirm: () => void;
}

const text = function (node: HTMLElement, value: string) { if (node.textContent !== value) node.textContent = value; };
const holdReason = function (state: State, available: boolean): string {
	if (state.status === 'won' || state.status === 'lost') return 'Voyage ended. Field commands are closed.';
	if (!state.focused) return 'Command link unfocused. Return to the game to place a field.';
	if (state.paused) return 'Paused. Resume to place a field.';
	return available ? '' : 'Commands held. Begin or resume the voyage to place a field.';
};
const relativePosition = function (point: Point): string {
	const longitudinal = `${Math.round(Math.abs(point.x))} m ${point.x >= 0 ? 'ahead' : 'astern'}`;
	const lateral = `${Math.round(Math.abs(point.y))} m ${point.y < 0 ? 'port' : 'starboard'}`;
	return `${longitudinal} · ${lateral}`;
};

// Keep controls mounted so simulation updates preserve native keyboard focus.
export const createInterdictionPanel = function (host: HTMLElement, getState: () => State, available: () => boolean, placement: Placement, signal: AbortSignal): () => void {
	const heading = document.createElement('div'); heading.className = 'interdiction-heading';
	const title = document.createElement('h2'); title.id = 'interdiction-title'; title.textContent = 'INTERDICTION';
	const status = document.createElement('span'); status.id = 'interdiction-status';
	heading.append(title, status); host.append(heading); host.setAttribute('aria-labelledby', title.id);
	const specification = document.createElement('p'); specification.className = 'interdiction-specification';
	specification.textContent = `${INTERDICTION_CONFIG.cost} salvage · ${INTERDICTION_CONFIG.maxRange} m placement range · ${INTERDICTION_CONFIG.radius} m radius`;
	const lifetime = document.createElement('p'); lifetime.className = 'interdiction-specification';
	lifetime.textContent = `Fixed position · ${INTERDICTION_CONFIG.lifetime}s life · ${INTERDICTION_CONFIG.cooldown}s cooldown`;
	const fieldPosition = document.createElement('p'); fieldPosition.className = 'interdiction-position'; fieldPosition.id = 'interdiction-position';
	host.append(specification, lifetime, fieldPosition);
	const toggle = document.createElement('button'); toggle.type = 'button'; toggle.id = 'interdiction-toggle';
	toggle.setAttribute('aria-describedby', 'interdiction-reason interdiction-instructions');
	toggle.addEventListener('click', function () {
		const state = getState();
		if (holdReason(state, available())) return;
		if (placement.get()) placement.cancel();
		else if (!interdictionReason(state)) placement.aim({ x: 300, y: 0 });
		update();
	}, { signal });
	host.append(toggle);
	const presets = document.createElement('div'); presets.className = 'interdiction-presets';
	presets.setAttribute('role', 'group'); presets.setAttribute('aria-label', 'Preview field position');
	const presetPositions = [
		{ name: 'Ahead', key: 'ahead', point: { x: 300, y: 0 } },
		{ name: 'Port', key: 'port', point: { x: 0, y: -270 } },
		{ name: 'Starboard', key: 'starboard', point: { x: 0, y: 270 } },
	];
	const presetButtons = presetPositions.map(function ({ name, key, point }) {
		const control = document.createElement('button'); control.type = 'button'; control.textContent = name; control.dataset['interdictionPreset'] = key;
		control.setAttribute('aria-label', `Preview ${name.toLowerCase()} field position`);
		control.setAttribute('aria-describedby', 'interdiction-reason');
		control.addEventListener('click', function () {
			const state = getState();
			if (!holdReason(state, available()) && !interdictionReason(state)) placement.aim({ ...point });
			update();
		}, { signal });
		presets.append(control); return control;
	});
	host.append(presets);
	const preview = document.createElement('p'); preview.className = 'interdiction-position'; preview.id = 'interdiction-preview';
	const actions = document.createElement('div'); actions.className = 'interdiction-actions';
	const confirm = document.createElement('button'); confirm.type = 'button'; confirm.id = 'interdiction-confirm'; confirm.textContent = 'Place field';
	confirm.setAttribute('aria-describedby', 'interdiction-reason');
	confirm.addEventListener('click', function () {
		const state = getState(); const point = placement.get();
		if (point && !holdReason(state, available()) && !interdictionReason(state, point)) placement.confirm();
		update();
	}, { signal });
	const cancel = document.createElement('button'); cancel.type = 'button'; cancel.id = 'interdiction-cancel'; cancel.textContent = 'Cancel';
	cancel.addEventListener('click', function () {
		if (!holdReason(getState(), available())) placement.cancel();
		update();
	}, { signal });
	actions.append(confirm, cancel);
	const instructions = document.createElement('p'); instructions.className = 'interdiction-instructions'; instructions.id = 'interdiction-instructions';
	instructions.textContent = 'I: preview · click/tap battlefield to aim · ↑↓ ahead/astern · ←→ port/starboard · Enter: place · Esc: cancel';
	const reason = document.createElement('p'); reason.className = 'interdiction-reason'; reason.id = 'interdiction-reason'; reason.setAttribute('role', 'status');
	host.append(preview, actions, instructions, reason);
	const update = function () {
		const state = getState(); const systems = state.systems;
		const interdiction = systems.interdiction; const point = placement.get(); const active = !!point;
		const hold = holdReason(state, available()); const startReason = hold || interdictionReason(state);
		const placementReason = point ? hold || interdictionReason(state, point) : startReason;
		const field = interdiction.field; const relative = fieldRelative(state);
		text(status, field ? `Active ${Math.ceil(field.remaining)}s` : interdiction.cooldown > 0 ? `Cooldown ${Math.ceil(interdiction.cooldown)}s` : 'Ready');
		text(fieldPosition, field && relative ? `Field: ${relativePosition(relative)}` : 'No active field.');
		text(toggle, active ? 'Cancel preview (I)' : 'Preview field (I)');
		toggle.setAttribute('aria-pressed', String(active)); toggle.disabled = active ? !!hold : !!startReason;
		for (const control of presetButtons) control.disabled = !!startReason;
		preview.hidden = !active; actions.hidden = !active;
		text(preview, point ? `Preview: ${relativePosition(point)}` : '');
		confirm.disabled = !active || !!placementReason; cancel.disabled = !!hold;
		text(reason, placementReason || (active ? 'Position ready. Confirm to spend salvage and place the field.' : 'Preview a position, then confirm to place the field.'));
	};
	return update;
};
