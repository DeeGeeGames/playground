import { COVERAGE_SECTORS, coverageReadiness, SECTOR_NAMES, type CoveragePriority } from './escort-coverage';
import { balanceCoverage, type Sector, type State } from './simulation';

const text = function (node: Element, value: string) { if (node.textContent !== value) node.textContent = value; };
const labelFor = function (priority: CoveragePriority) { return priority[0]?.toUpperCase() + priority.slice(1); };
export const createRadarCoverage = function (root: HTMLElement, svg: SVGSVGElement, getState: () => State, available: () => boolean, show: (sector: Sector) => void, signal: AbortSignal) {
	let selected: Sector = 'port';
	const heading = document.createElement('h3'); heading.textContent = 'Escort coverage';
	const intro = document.createElement('p'); intro.className = 'radar-explanation'; intro.textContent = 'Set priorities. Escorts choose their own patrol and intercept positions.';
	const rows = document.createElement('div'); rows.className = 'radar-coverage-rows';
	const status = document.createElement('p'); status.className = 'radar-coverage-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
	const override = document.createElement('p'); override.id = 'coverage-override'; override.className = 'radar-explanation';
	const balanced = document.createElement('button'); balanced.type = 'button'; balanced.textContent = 'Balanced'; balanced.className = 'radar-balanced';
	balanced.addEventListener('click', function () { if (available()) balanceCoverage(getState()); update(); }, { signal });
	root.append(heading, intro, rows, balanced, override, status);
	const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g'); layer.classList.add('radar-sectors'); svg.prepend(layer);
	const controls = COVERAGE_SECTORS.map(function (sector, index) {
		const row = document.createElement('div'); row.className = 'radar-coverage-row';
		const button = document.createElement('button'); button.type = 'button';
		const name = document.createElement('strong'); name.textContent = SECTOR_NAMES[sector];
		const count = document.createElement('small'); button.append(name, count);
		const priorityText = document.createElement('span');
		button.addEventListener('click', function () { selected = sector; show(sector); update(); }, { signal });
		row.append(button, priorityText); rows.append(row);
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		const start = (-135 + index * 90) * Math.PI / 180; const end = start + Math.PI / 2;
		path.setAttribute('d', `M220 220L${220 + Math.cos(start) * 180} ${220 + Math.sin(start) * 180}A180 180 0 0 1 ${220 + Math.cos(end) * 180} ${220 + Math.sin(end) * 180}Z`);
		path.classList.add('radar-sector'); path.setAttribute('role', 'button'); path.setAttribute('tabindex', '0'); path.setAttribute('aria-label', `Select ${SECTOR_NAMES[sector]} coverage`);
		const choose = function () { selected = sector; show(sector); update(); };
		path.addEventListener('click', choose, { signal }); path.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } }, { signal }); layer.append(path);
		const x = sector === 'port' ? 22 : sector === 'starboard' ? 418 : 220; const y = sector === 'ahead' ? 20 : sector === 'astern' ? 416 : 218;
		const caption = document.createElementNS('http://www.w3.org/2000/svg', 'text'); caption.setAttribute('x', String(x)); caption.setAttribute('y', String(y)); caption.setAttribute('text-anchor', 'middle'); caption.classList.add('radar-sector-caption'); caption.textContent = sector === 'starboard' ? 'STBD' : SECTOR_NAMES[sector].toUpperCase();
		const priorityLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text'); priorityLabel.setAttribute('x', String(x)); priorityLabel.setAttribute('y', String(y + 13)); priorityLabel.setAttribute('text-anchor', 'middle'); priorityLabel.classList.add('radar-sector-priority'); svg.append(caption, priorityLabel);
		return { sector, button, priorityText, count, path, priorityLabel };
	});
	const boundaries = document.createElementNS('http://www.w3.org/2000/svg', 'path'); boundaries.setAttribute('d', 'M92.72 92.72L347.28 347.28M92.72 347.28L347.28 92.72'); boundaries.classList.add('radar-sector-boundaries'); layer.append(boundaries);
	const update = function () {
		const state = getState(); const all = state.coverage.all;
		for (const control of controls) {
			const readiness = coverageReadiness(state, control.sector); const priority = all === control.sector ? 'all' : state.coverage.priorities[control.sector];
			const disabled = !available() || (all !== undefined && all !== control.sector);
			control.button.disabled = !available();
			control.button.title = disabled ? 'Held by All override; open Coverage to release it.' : 'Edit spatial coverage';
			text(control.priorityText, all && all !== control.sector ? 'Held' : labelFor(priority));
			control.button.setAttribute('aria-pressed', String(selected === control.sector)); control.path.setAttribute('aria-pressed', String(selected === control.sector)); control.path.classList.toggle('selected', selected === control.sector);
			text(control.count, `${readiness.onStation} / ${readiness.planned} craft`);
			text(control.priorityLabel, all && all !== control.sector ? 'HELD' : labelFor(priority).toUpperCase());
		}
		balanced.disabled = !available() || all !== undefined;
		text(override, all ? `All escorts → ${SECTOR_NAMES[all]}. Other priorities are held. Choose another priority here to restore them.` : 'On station / planned craft. Whole wings stay together; guardians and fighters allocate separately.');
		const readiness = coverageReadiness(state, selected);
		text(status, `${SECTOR_NAMES[selected]} · ${readiness.onStation} screening · ${readiness.inbound} inbound · ${readiness.unavailable} in bay / launching / returning. ${state.experimental ? 'Scrambled wings launch when ready. Replace losses during rearm in Escort Bay.' : 'Escorts intercept this side, then return to screen.'}`);
	};
	return { update, reset: function () { selected = 'port'; } };
};
