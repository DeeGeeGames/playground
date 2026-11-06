import { getWeapon, type WeaponId, type WeaponMount } from './arsenal';
import type { FrameDefinition } from './frames';

export const frameCard = function (frame: FrameDefinition, onSelect: () => void) {
	const button = document.createElement('button');
	button.className = 'frame-card'; button.dataset['frame'] = frame.id;
	button.style.setProperty('--frame-color', frame.color);
	const role = document.createElement('span'); role.className = 'frame-role'; role.textContent = `${frame.mass}T · ${frame.role}`;
	const title = document.createElement('b'); title.textContent = `${frame.name} / ${frame.designation}`;
	const weapon = document.createElement('span'); weapon.className = 'frame-starter'; weapon.textContent = `STARTS WITH ${getWeapon(frame.starter).name}`;
	const description = document.createElement('p'); description.textContent = frame.description;
	const tradeoff = document.createElement('p'); tradeoff.className = 'frame-tradeoff'; tradeoff.textContent = frame.tradeoff;
	const stats = document.createElement('span'); stats.className = 'frame-stats';
	stats.textContent = `${frame.speed} m/s cruise · ${frame.cooling} heat/s cooling`;
	const badge = document.createElement('small'); badge.className = 'frame-badge'; badge.textContent = 'SELECT FRAME';
	button.append(role, title, weapon, description, tradeoff, stats, badge);
	button.addEventListener('click', onSelect);
	return button;
};

export const MOUNTS = [
	{ action: 'mount-0', mouse: 'LEFT', pad: 'RT / R2', key: '1', button: 0 },
	{ action: 'mount-1', mouse: 'RIGHT', pad: 'LT / L2', key: '2', button: 2 },
	{ action: 'mount-2', mouse: 'MIDDLE', pad: 'RB / R1', key: '3', button: 1 },
	{ action: 'mount-3', mouse: 'THUMB', pad: 'LB / L1', key: '4', button: 3 },
] as const;
export const rankLabel = function (level: number) { return ['I', 'II', 'III'][level - 1] ?? 'I'; };

// Small authored SVG schematics keep the armory legible at every viewport size.
const schematic = function (id: WeaponId) {
	const drawings: Record<WeaponId, string> = {
		laser: '<path d="M20 25h44v30H20zM64 31h16v18H64M80 40h62M96 30l12 10-12 10M118 30l12 10-12 10"/><circle cx="42" cy="40" r="8"/>',
		'machine-gun': '<path d="M18 28h42v26H18zM60 30h56v7H60M60 45h56v7H60M26 54v12h25V54M124 33h16M130 48h16M20 22h36"/>',
		autocannon: '<path d="M18 27h44v32H18zM62 33h58v19H62M120 30h16v25h-16M26 59v8h28v-8M28 37h20v12H28"/>',
		ppc: '<path d="M18 28h38v29H18zM56 34h46v17H56M63 25v35M77 25v35M91 25v35M112 42h32M121 31l13 11-13 11"/><circle cx="112" cy="42" r="8"/>',
		'stream-missiles': '<path d="M18 27h34v31H18zM63 40h36l12 7-12 7H63l7-7zM90 20h28l12 6-12 6H90M120 66q20-5 20-21"/>',
		'cluster-missiles': '<path d="M18 24h35v36H18zM62 38h28l12 6-12 6H62M104 20h20l10 5-10 5h-20M112 56h20l10 5-10 5h-20M94 15q25-8 45 8M101 67q30 10 44-6"/>',
		'stream-rockets': '<path d="M18 29h40v26H18zM69 37h33l13 7-13 7H69l6-7zM55 44h-10M125 44h26M125 18h26M125 70h26M86 21h24l9 5-9 5H86"/>',
		'cluster-rockets': '<path d="M18 24h36v36H18zM65 37h25l12 7-12 7H65M99 17h22l12 6-12 6H99M99 59h22l12 6-12 6H99M140 40v10M135 45h10M145 18l5 5M145 67l5-5"/>',
	};
	return `<svg viewBox="0 0 168 86" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">${drawings[id]}</g></svg>`;
};
export const weaponCard = function (id: WeaponId, badge: string, onSelect: () => void) {
	const weapon = getWeapon(id);
	const button = document.createElement('button');
	button.className = 'arsenal-card'; button.dataset['choice'] = id;
	button.style.setProperty('--weapon-color', weapon.color);
	const category = document.createElement('span'); category.className = 'weapon-family'; category.textContent = weapon.type;
	const art = document.createElement('div'); art.className = 'weapon-schematic'; art.innerHTML = schematic(id);
	const title = document.createElement('b'); title.textContent = weapon.name;
	const description = document.createElement('p'); description.textContent = weapon.description;
	const stats = document.createElement('span'); stats.className = 'weapon-spec';
	stats.textContent = `${weapon.role} · ${weapon.range}m`;
	const heat = document.createElement('span'); heat.className = 'weapon-heat';
	heat.textContent = weapon.kind === 'laser' ? `${weapon.damage} dmg/s · ${weapon.heat} heat/s` : `${weapon.damage} × ${weapon.projectiles} dmg / ${weapon.interval}s · ${weapon.heat} heat`;
	stats.append(document.createElement('br'), heat);
	const tag = document.createElement('small'); tag.className = 'weapon-badge'; tag.textContent = badge;
	button.append(category, art, title, description, stats, tag);
	button.addEventListener('click', onSelect);
	return button;
};
export const mountSummary = function (loadout: readonly WeaponMount[], onReplace?: (index: number) => void) {
	return MOUNTS.map(function (binding, index) {
		const mount = loadout[index];
		const node = document.createElement(onReplace && mount ? 'button' : 'div');
		node.className = 'mount-chip';
		const label = document.createElement('small'); label.textContent = `${index + 1} · ${binding.mouse} / ${binding.pad.split(' / ')[0]}`;
		const name = document.createElement('b'); name.textContent = mount ? `${getWeapon(mount.weapon).name} · ${rankLabel(mount.level)}` : 'EMPTY MOUNT';
		node.append(label, name);
		if (onReplace && mount) node.addEventListener('click', function () { onReplace(index); });
		return node;
	});
};
