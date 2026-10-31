import { journeyFor } from './journey';
import { assignRepair, repairTargets, REPAIR_CREWS, setAllocation, transferPower, WEAPONS, type State } from './simulation';
import { POWER_CHANNELS, POWER_PRESETS, REACTOR_UNITS, effectiveOutputs, conditionMultiplier, type PowerChannel } from './systems';

const CHANNEL_NAMES: Record<PowerChannel, string> = { engines: 'Engines', weapons: 'Weapons', shields: 'Shields' };
const PRESET_NAMES: Record<keyof typeof POWER_PRESETS, string> = { balanced: 'Balanced', engines: 'Engine priority', weapons: 'Weapons priority', shields: 'Shield priority' };
const text = function (node: HTMLElement, value: string) { if (node.textContent !== value) node.textContent = value; };
const selectedChannel = function (control: HTMLSelectElement) { return POWER_CHANNELS.find(function (channel) { return channel === control.value; }); };
const heldReason = function (state: State, available: boolean) {
	if (state.status === 'won' || state.status === 'lost') return 'Voyage ended. Power changes are closed.';
	if (!state.focused) return 'Command link unfocused. Return to the game to change power.';
	if (state.paused) return 'Paused. Resume to change power.';
	return available ? '' : 'Commands held. Begin or resume the voyage to change power.';
};

// Build controls once so native keyboard focus survives simulation updates.
export const createEngineeringPanel = function (host: HTMLElement, getState: () => State, available: () => boolean, signal: AbortSignal): () => void {
	const heading = document.createElement('div'); heading.className = 'engineering-heading';
	const budget = document.createElement('span'); budget.id = 'engineering-budget';
	heading.append(budget); host.append(heading);
	const outputs = document.createElement('dl'); outputs.className = 'engineering-outputs';
	const rows = POWER_CHANNELS.map(function (channel) {
		const row = document.createElement('div'); row.dataset['powerChannel'] = channel;
		const name = document.createElement('dt'); name.textContent = CHANNEL_NAMES[channel];
		const value = document.createElement('dd'); value.id = `engineering-${channel}-output`;
		row.append(name, value); outputs.append(row); return { channel, value };
	});
	host.append(outputs);
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
	const crewBudget = document.createElement('p'); crewBudget.className = 'engineering-reason'; crewBudget.id = 'repair-budget'; host.append(crewBudget);
	const repairRows = ['hull', 'engines', 'sensors', 'generator', ...Array.from({ length: 8 }, function (_, index) { return `mount:${index}`; })].map(function (id) {
		const row = document.createElement('div'); row.className = 'repair-row'; row.dataset['repairTarget'] = id;
		const detail = document.createElement('span'); const controls = document.createElement('div');
		const buttons = [-1, 1].map(function (delta) {
			const button = document.createElement('button'); button.type = 'button'; button.textContent = delta < 0 ? '−' : '+';
			button.setAttribute('aria-label', `${delta < 0 ? 'Remove' : 'Assign'} crew ${id}`);
			button.addEventListener('click', function () { if (available()) assignRepair(getState(), id, (getState().repairs[id] ?? 0) + delta); update(); }, { signal });
			controls.append(button); return { button, delta };
		});
		row.append(detail, controls); host.append(row); return { id, row, detail, buttons };
	});
	const update = function () {
		const state = getState(); const systems = state.systems;
		const allocation = systems.allocation; const output = effectiveOutputs(systems); const journey = journeyFor(state);
		const hold = heldReason(state, available());
		const targets = repairTargets(state); const used = Object.values(state.repairs).reduce(function (sum, crews) { return sum + crews; }, 0);
		text(crewBudget, `Repair crews: ${REPAIR_CREWS - used} / ${REPAIR_CREWS} free · no salvage cost. ± splits crews. Each crew: hull +12/s, equipment +4/s. Integrity below 50: impaired; zero: offline.`);
		for (const { id, row, detail, buttons } of repairRows) {
			const target = targets.find(function (item) { return item.id === id; }); row.hidden = !target;
			if (!target) continue;
			const crews = state.repairs[id] ?? 0;
			const condition = id === 'hull' ? 'hull' : target.integrity <= 0 ? 'offline' : target.integrity < 50 ? 'impaired' : 'functional';
			const mount = id.startsWith('mount:') ? state.mounts[Number(id.slice(6))] : undefined;
			const cadence = mount?.weapon ? ` · ${(output.weaponRate * conditionMultiplier(target.integrity) * (1 + (mount.level - 1) * 0.12) / WEAPONS[mount.weapon].reload).toFixed(2)} shots/s` : '';
			const rate = crews * (id === 'hull' ? 12 : 4);
			const progress = rate > 0 ? ` · +${rate}/s · ${Math.ceil((target.maximum - target.integrity) / rate)}s to full` : '';
			text(detail, `${id === 'generator' ? 'Shield generator' : target.name}: ${Math.ceil(target.integrity)}/${target.maximum} · ${condition}${cadence} · ${crews} crews${progress}`);
			for (const { button, delta } of buttons) button.disabled = !!hold || (delta < 0 ? crews === 0 : used >= REPAIR_CREWS || target.integrity >= target.maximum);
		}
		text(budget, `${allocation.engines + allocation.weapons + allocation.shields} / ${REACTOR_UNITS} units`);
		for (const { channel, value } of rows) {
			const effect = channel === 'engines' ? `${output.speed.toFixed(0)} m/s${journey.speed === 0 ? ' set' : ''}` : channel === 'weapons' ? `${output.weaponRate.toFixed(2)}× cadence` : `+${output.shieldRecharge.toFixed(0)} HP/s`;
			text(value, `${allocation[channel]} units · ${effect}`);
		}
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
