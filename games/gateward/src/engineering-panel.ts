import { journeyFor } from './journey';
import { setAllocation, transferPower, type State } from './simulation';
import { POWER_CHANNELS, POWER_PRESETS, REACTOR_UNITS, powerOutputs, type PowerChannel } from './systems';

const CHANNEL_NAMES: Record<PowerChannel, string> = { engines: 'Engines', weapons: 'Weapons', shields: 'Shields' };
const PRESET_NAMES: Record<keyof typeof POWER_PRESETS, string> = { balanced: 'Balanced', engines: 'Engine priority', weapons: 'Weapons priority', shields: 'Shield priority' };
const text = function (node: HTMLElement, value: string) { if (node.textContent !== value) node.textContent = value; };
const selectedChannel = function (control: HTMLSelectElement) { return POWER_CHANNELS.find(function (channel) { return channel === control.value; }); };
const travelTime = function (seconds: number) {
	if (!Number.isFinite(seconds)) return 'Stalled';
	const rounded = Math.ceil(Math.max(0, seconds));
	return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
};
const heldReason = function (state: State, available: boolean) {
	if (state.status === 'won' || state.status === 'lost') return 'Voyage ended. Power changes are closed.';
	if (!state.focused) return 'Command link unfocused. Return to the game to change power.';
	if (state.paused) return 'Paused. Resume to change power.';
	return available ? '' : 'Commands held. Begin or resume the voyage to change power.';
};

// Build controls once so native keyboard focus survives simulation updates.
export const createEngineeringPanel = function (host: HTMLElement, getState: () => State, available: () => boolean, signal: AbortSignal): () => void {
	const heading = document.createElement('div'); heading.className = 'engineering-heading';
	const title = document.createElement('h2'); title.id = 'engineering-title'; title.textContent = 'REACTOR';
	const budget = document.createElement('span'); budget.id = 'engineering-budget';
	heading.append(title, budget); host.append(heading); host.setAttribute('aria-labelledby', title.id);
	const outputs = document.createElement('dl'); outputs.className = 'engineering-outputs';
	const rows = POWER_CHANNELS.map(function (channel) {
		const row = document.createElement('div'); row.dataset['powerChannel'] = channel;
		const name = document.createElement('dt'); name.textContent = CHANNEL_NAMES[channel];
		const value = document.createElement('dd'); value.id = `engineering-${channel}-output`;
		row.append(name, value); outputs.append(row); return { channel, value };
	});
	host.append(outputs);
	const travel = document.createElement('p'); travel.className = 'engineering-travel'; travel.id = 'engineering-travel';
	const eta = document.createElement('span'); eta.id = 'engineering-eta';
	const distance = document.createElement('span'); distance.id = 'engineering-distance';
	travel.append(eta, distance); host.append(travel);
	const presets = document.createElement('div'); presets.className = 'engineering-presets'; presets.setAttribute('role', 'group'); presets.setAttribute('aria-label', 'Reactor presets');
	const presetButtons = Object.entries(POWER_PRESETS).map(function ([key, allocation]) {
		const name = key === 'balanced' || key === 'engines' || key === 'weapons' || key === 'shields' ? PRESET_NAMES[key] : 'Preset';
		const control = document.createElement('button'); control.type = 'button'; control.dataset['powerPreset'] = key;
		const label = document.createElement('span'); label.textContent = name;
		const split = document.createElement('small'); split.textContent = `${allocation.engines}E / ${allocation.weapons}W / ${allocation.shields}S`;
		control.append(label, split); control.setAttribute('aria-label', `${name}: engines ${allocation.engines}, weapons ${allocation.weapons}, shields ${allocation.shields}`);
		control.setAttribute('aria-describedby', 'engineering-reason');
		control.addEventListener('click', function () { if (available()) setAllocation(getState(), allocation); update(); }, { signal });
		presets.append(control); return { control, allocation };
	});
	host.append(presets);
	const transfer = document.createElement('div'); transfer.className = 'engineering-transfer';
	const channelSelect = function (name: string, id: string, initial: PowerChannel) {
		const label = document.createElement('label'); label.textContent = name;
		const control = document.createElement('select'); control.id = id;
		for (const channel of POWER_CHANNELS) {
			const option = document.createElement('option'); option.value = channel; option.textContent = CHANNEL_NAMES[channel]; control.append(option);
		}
		control.value = initial; control.setAttribute('aria-describedby', 'engineering-reason');
		control.addEventListener('change', function () { update(); }, { signal });
		label.append(control); transfer.append(label); return control;
	};
	const donor = channelSelect('Donor', 'engineering-donor', 'engines');
	const recipient = channelSelect('Recipient', 'engineering-recipient', 'weapons');
	const transferButton = document.createElement('button'); transferButton.type = 'button'; transferButton.id = 'engineering-transfer'; transferButton.textContent = 'Transfer 1';
	transferButton.setAttribute('aria-describedby', 'engineering-reason');
	transferButton.addEventListener('click', function () {
		const from = selectedChannel(donor); const to = selectedChannel(recipient);
		if (available() && from && to) transferPower(getState(), from, to);
		update();
	}, { signal });
	transfer.append(transferButton); host.append(transfer);
	const reason = document.createElement('p'); reason.className = 'engineering-reason'; reason.id = 'engineering-reason'; reason.setAttribute('role', 'status'); host.append(reason);
	const update = function () {
		const state = getState(); const systems = state.systems; host.hidden = !systems;
		if (!systems) return;
		const allocation = systems.allocation; const output = powerOutputs(allocation); const journey = journeyFor(state);
		const hold = heldReason(state, available());
		text(budget, `${allocation.engines + allocation.weapons + allocation.shields} / ${REACTOR_UNITS} units`);
		for (const { channel, value } of rows) {
			const effect = channel === 'engines' ? `${output.speed.toFixed(0)} m/s${journey.speed === 0 ? ' set' : ''}` : channel === 'weapons' ? `${output.weaponRate.toFixed(2)}× cadence` : `+${output.shieldRecharge.toFixed(0)} HP/s`;
			text(value, `${allocation[channel]} units · ${effect}`);
		}
		text(eta, `Travel ETA ${travelTime(journey.eta)} · excludes combat`);
		text(distance, `${Math.floor(journey.distance).toLocaleString()} m traveled · ${Math.ceil(journey.remaining).toLocaleString()} m left`);
		for (const { control, allocation: preset } of presetButtons) {
			control.disabled = !!hold;
			control.setAttribute('aria-pressed', String(POWER_CHANNELS.every(function (channel) { return allocation[channel] === preset[channel]; })));
		}
		donor.disabled = !!hold; recipient.disabled = !!hold;
		const from = selectedChannel(donor); const to = selectedChannel(recipient);
		const why = hold || (!from || !to ? 'Choose a donor and recipient.' : from === to ? 'Choose different donor and recipient channels.' : allocation[from] === 0 ? `${CHANNEL_NAMES[from]} has no power to transfer.` : 'Transfer one unit from donor to recipient.');
		text(reason, why); transferButton.disabled = !!hold || !from || !to || from === to || allocation[from] === 0;
	};
	return update;
};
