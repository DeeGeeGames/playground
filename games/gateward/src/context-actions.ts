import { FORMATION_SLOTS, HULLS, type Formation } from './formation';
import { fleetShips, type FleetFocus } from './fleet-focus';
import { arrangePlatform, build, constructPlatform, constructionCostRequirement, invested, MAX_HULL, pulse, recallAll, repair, REPAIR_CREWS, scrambleAll, sell, setPriority, upgrade, upgradeCost, WEAPONS, type State, type Weapon } from './simulation';
import { contactIntel } from './sensors';
import type { Inspector } from './play-screen';

type Target = { kind: 'slot'; slot: Formation } | { kind: 'mount'; index: number } | { kind: 'enemy'; id: number } | { kind: 'fleet'; id: FleetFocus };
interface Action { id: string; label: string; disabled?: boolean; title?: string; run: () => void }
interface Commands {
	state: () => State;
	active: () => boolean;
	order: (action: () => boolean) => void;
	mount: (index: number) => void;
	slot: (slot: Formation) => void;
	inspect: (view: Inspector) => void;
	follow: (id: FleetFocus) => void;
	focus: () => void;
}

/** World selection stays in the playfield; full systems remain an explicit choice. */
export const createContextActions = function (root: HTMLElement, commands: Commands, signal: AbortSignal) {
	const panel = document.createElement('section'); panel.id = 'context-actions'; panel.hidden = true; panel.setAttribute('aria-label', 'Selected object actions');
	const heading = document.createElement('strong');
	const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = '×'; dismiss.setAttribute('aria-label', 'Dismiss selection');
	const header = document.createElement('header'); header.append(heading, dismiss);
	const detail = document.createElement('p');
	const actions = document.createElement('div'); actions.className = 'context-buttons';
	panel.append(header, detail, actions); root.append(panel);
	let target: Target | undefined;
	let moving: number | undefined;
	let anchor = { x: 0, y: 0 };
	const controls = new Map<string, HTMLButtonElement>();
	const close = function () {
		const restoreFocus = panel.contains(document.activeElement);
		target = undefined; moving = undefined; panel.hidden = true;
		if (restoreFocus) commands.focus();
	};
	dismiss.addEventListener('click', function () { close(); commands.focus(); }, { signal });
	const select = function (next: Target) {
		target = next; moving = undefined;
		if (next.kind === 'mount') commands.mount(next.index);
		if (next.kind === 'slot') commands.slot(next.slot);
	};
	const update = function () {
		if (!target || !commands.active()) { close(); return; }
		const focused = panel.contains(document.activeElement) ? document.activeElement : undefined;
		const state = commands.state(); const fitting = state.status === 'fitting';
		const items: Action[] = [];
		let title = ''; let description = '';
		const add = function (id: string, label: string, run: () => void, disabled = false, hint = '') { items.push({ id, label, run, disabled, title: hint }); };
		const inspect = function (view: Inspector) { close(); commands.inspect(view); };
		const mountActions = function (index: number) {
			const mount = state.mounts[index]; if (!mount) return;
			title = `Mount ${index + 1} · ${mount.weapon ? WEAPONS[mount.weapon].name : 'Empty'}`;
			description = fitting ? `Fit here, then select another mount. Available: ${Math.floor(state.salvage)} salvage.` : 'Weapons engage automatically within range and arc. Refit between passages.';
			if (!mount.weapon) {
				for (const kind of ['flak', 'rail', 'missile', 'beam'] satisfies Weapon[]) {
					const weapon = WEAPONS[kind];
					add(`build-${kind}`, `${weapon.name} · ${weapon.cost}`, function () { commands.order(function () { return build(commands.state(), index, kind); }); }, !fitting || state.salvage < weapon.cost, weapon.description);
				}
			} else {
				add('upgrade', mount.level >= 3 ? 'Fully upgraded' : `Upgrade · ${upgradeCost(mount)}`, function () { commands.order(function () { return upgrade(commands.state(), index); }); }, !fitting || mount.level >= 3 || state.salvage < upgradeCost(mount));
				add('sell', `Salvage · +${invested(mount)}`, function () { commands.order(function () { return sell(commands.state(), index); }); }, !fitting, 'Full weapon refund');
			}
			const siblings = state.mounts.flatMap(function (other, i) { return other.platform === mount.platform && i !== index ? [i] : []; });
			const adjacent = [siblings.filter(function (i) { return i < index; }).at(-1), siblings.find(function (i) { return i > index; })];
			for (const i of adjacent) if (i !== undefined) add(`mount-${i}`, `${i < index ? '←' : '→'} Mount ${i + 1}${state.mounts[i]?.weapon ? ' · fitted' : ' · empty'}`, function () { select({ kind: 'mount', index: i }); });
			const platform = state.convoy?.platforms.find(function (p) { return p.id === mount.platform; });
			if (platform) add('ship', 'Ship / formation', function () { select({ kind: 'slot', slot: platform.slot }); });
			add('details', 'Systems details', function () { inspect('mounts'); });
		};
		if (target.kind === 'mount') mountActions(target.index);
		if (target.kind === 'slot') {
			const slot = target.slot; const platform = state.convoy?.platforms.find(function (p) { return p.slot === slot; });
			title = FORMATION_SLOTS[slot].label;
			if (!platform) {
				description = `Hull purchases are permanent; weapons cost extra.${state.mounts.some(function (mount) { return !!mount.weapon; }) ? '' : ' Keep 75 salvage for the first weapon.'} Available: ${Math.floor(state.salvage)} salvage.`;
				for (const kind of ['corvette', 'frigate', 'cruiser'] as const) {
					const hull = HULLS[kind]; const required = constructionCostRequirement(state, kind);
					add(`hull-${kind}`, `${hull.name} · ${hull.cost}`, function () { commands.order(function () {
						const current = commands.state(); const index = current.mounts.length;
						if (!constructPlatform(current, slot, kind)) return false;
						select({ kind: 'mount', index }); return true;
					}); }, !fitting || state.salvage < required, `${hull.mounts} turret mounts. Requires ${required} salvage including first-weapon reserve.`);
				}
			} else {
				description = moving === platform.id ? 'Select another ring position to move or swap. Escape cancels.' : `P${platform.id + 1} ${HULLS[platform.hull].name} · ${Math.ceil(platform.hp)} hull`;
				for (const [index, mount] of state.mounts.entries()) if (mount.platform === platform.id) add(`fit-${index}`, `Mount ${index + 1} · ${mount.weapon ? WEAPONS[mount.weapon].name : 'Fit weapon'}`, function () { select({ kind: 'mount', index }); }, platform.hp <= 0);
				add('move', moving === platform.id ? 'Cancel move' : 'Move / swap…', function () { moving = moving === platform.id ? undefined : platform.id; commands.focus(); }, !fitting);
				add('follow', 'Follow ship', function () { commands.follow(`platform:${platform.id}`); close(); });
			}
			add('details', 'Shipyard details', function () { inspect('mounts'); });
		}
		if (target.kind === 'enemy') {
			const id = target.id; const enemy = state.enemies.find(function (e) { return e.id === id && e.hp > 0; });
			if (!enemy || state.priority !== id || contactIntel(state, enemy) === 'unseen') { close(); return; }
			title = contactIntel(state, enemy) === 'classified' ? `${enemy.kind} · Priority target` : 'Contact · Priority target';
			description = 'Eligible weapons focus this target within range and coverage.';
			add('clear', 'Clear priority', function () { commands.order(function () { return setPriority(commands.state(), undefined); }); close(); });
			add('details', 'Contact details', function () { inspect('contact'); });
		}
		if (target.kind === 'fleet') {
			const id = target.id; const ship = fleetShips(state).find(function (s) { return s.id === id; });
			if (!ship) { close(); return; }
			title = ship.name; description = ship.detail;
			if (id === 'ark') {
				const crews = state.repairs['hull'] ?? 0; const used = Object.values(state.repairs).reduce(function (sum, n) { return sum + n; }, 0);
				add('repair', crews ? 'Release hull crews' : 'Repair hull', function () { commands.order(function () { return repair(commands.state()); }); }, !crews && (state.hull >= MAX_HULL || used >= REPAIR_CREWS));
				add('pulse', 'Aegis pulse', function () { commands.order(function () { return pulse(commands.state()); }); }, fitting || state.pulseCooldown > 0);
			}
			add('scramble', 'Scramble all', function () { commands.order(function () { return scrambleAll(commands.state()); }); }, fitting || state.fightersScrambled || !state.wings.some(function (w) { return w.craft.some(function (c) { return c.hp > 0; }); }));
			add('recall', 'Recall all', function () { commands.order(function () { return recallAll(commands.state()); }); }, !state.fightersScrambled && !state.wings.some(function (w) { return w.phase === 'launching' || w.phase === 'sortie'; }));
			add('follow', 'Follow ship', function () { commands.follow(id); close(); });
			add('details', 'Escort orders', function () { inspect('escorts'); });
		}
		if (!title) { close(); return; }
		heading.textContent = title; if (detail.textContent !== description) detail.textContent = description;
		for (const [id, control] of controls) if (!items.some(function (item) { return item.id === id; })) { control.remove(); controls.delete(id); }
		for (const [index, item] of items.entries()) {
			let control = controls.get(item.id);
			if (!control) { control = document.createElement('button'); control.type = 'button'; controls.set(item.id, control); actions.append(control); }
			if (actions.children[index] !== control) actions.insertBefore(control, actions.children[index] ?? null);
			if (control.textContent !== item.label) control.textContent = item.label;
			control.disabled = item.disabled ?? false; control.title = item.title ?? '';
			control.onclick = function () { if (commands.active()) { item.run(); update(); } };
		}
		panel.hidden = false;
		if (focused && (!panel.contains(focused) || focused instanceof HTMLButtonElement && focused.disabled)) {
			const next = [...actions.querySelectorAll('button')].find(function (control) { return !control.disabled; });
			(next ?? dismiss).focus({ preventScroll: true });
		}
		const width = root.clientWidth; const height = root.clientHeight;
		panel.style.left = `${Math.max(8, Math.min(anchor.x + 16, width - panel.offsetWidth - 80))}px`;
		panel.style.top = `${Math.max(100, Math.min(anchor.y + 12, height - panel.offsetHeight - 120))}px`;
	};
	return {
		close,
		isOpen: function () { return !!target; },
		update,
		show: function (next: Target, x: number, y: number) {
			anchor = { x, y }; select(next); update();
		},
		moveTo: function (slot: Formation): boolean {
			if (moving === undefined) return false;
			const id = moving;
			commands.order(function () { return arrangePlatform(commands.state(), id, slot); });
			select({ kind: 'slot', slot }); update(); return true;
		},
	};
};
