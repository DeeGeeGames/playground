import { COVERAGE_PRIORITIES, COVERAGE_SECTORS, SECTOR_NAMES, coverageReadiness } from './escort-coverage';
import { contactWarning, setCoveragePriority, type Sector, type State } from './simulation';

const text = function (node: HTMLElement, value: string) { if (node.textContent !== value) node.textContent = value; };
export const createCoveragePanel = function (root: HTMLElement, getState: () => State, available: () => boolean, close: () => void, pause: () => void, signal: AbortSignal) {
	let selected: Sector = 'ahead';
	root.innerHTML = `<div class="coverage-heading"><h2>Escort coverage</h2><button type="button" data-pause>Pause</button><button type="button" data-close>Close</button></div><p class="coverage-help">Ship-relative · arrows choose sector · Enter opens priorities · Tab moves focus · Esc returns</p><div class="coverage-compass"><span class="coverage-ship" aria-hidden="true">↑<small>SHIP FORWARD</small></span></div><h3></h3><div class="coverage-priorities" aria-label="Coverage priority"></div><p class="coverage-override"></p><p class="coverage-readiness"></p><p class="sr-only" role="status"></p>`;
	const find = function (selector: string): HTMLElement { const node = root.querySelector<HTMLElement>(selector); if (!node) throw new Error(`Missing coverage ${selector}`); return node; };
	find('[data-close]').addEventListener('click', close, { signal });
	find('[data-pause]').addEventListener('click', pause, { signal });
	const compass = find('.coverage-compass'); const row = find('.coverage-priorities'); const announcement = find('[role="status"]');
	const sectors = COVERAGE_SECTORS.map(function (sector) {
		const button = document.createElement('button'); button.type = 'button'; button.className = `coverage-sector coverage-${sector}`;
		button.addEventListener('focus', function () { selected = sector; update(); }, { signal });
		button.addEventListener('click', function () { selected = sector; update(); }, { signal }); compass.append(button); return { sector, button };
	});
	const priorities = COVERAGE_PRIORITIES.map(function (priority) {
		const button = document.createElement('button'); button.type = 'button'; button.textContent = priority[0]?.toUpperCase() + priority.slice(1);
		button.addEventListener('click', function () {
			if (available() && setCoveragePriority(getState(), selected, priority)) text(announcement, `${SECTOR_NAMES[selected]} priority ${priority}. Allocation requested.`);
			update();
		}, { signal }); row.append(button); return { priority, button };
	});
	const focusSector = function () { sectors.find(function (control) { return control.sector === selected; })?.button.focus({ preventScroll: true }); };
	const enter = function () { priorities.find(function (control) { return control.button.getAttribute('aria-pressed') === 'true' && !control.button.disabled; })?.button.focus({ preventScroll: true }); };
	const direction = function (value: 'up' | 'right' | 'down' | 'left'): boolean {
		if (root.hidden) return false;
		if (row.contains(document.activeElement)) {
			if (value === 'up') { focusSector(); return true; }
			if (value === 'left' || value === 'right') {
				const index = priorities.findIndex(function (control) { return control.button === document.activeElement; });
				priorities[(index + (value === 'right' ? 1 : 4)) % 5]?.button.focus({ preventScroll: true }); return true;
			}
			return false;
		}
		selected = value === 'up' ? 'ahead' : value === 'down' ? 'astern' : value === 'left' ? 'port' : 'starboard'; update(); focusSector(); return true;
	};
	root.addEventListener('keydown', function (event) {
		if (event.repeat && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); return; }
		const value = event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowRight' ? 'right' : undefined;
		if (value) { event.preventDefault(); if (!event.repeat) direction(value); }
		if (event.key === 'Enter' && compass.contains(event.target instanceof Node ? event.target : null)) { event.preventDefault(); if (!event.repeat) enter(); }
		if (event.key === 'Escape' && row.contains(document.activeElement)) { event.preventDefault(); focusSector(); }
	}, { signal });
	const update = function () {
		const state = getState(); const all = state.coverage.all;
		text(find('.coverage-help'), `${contactWarning(state)} · Ship-relative: arrows choose sector · Enter opens priorities · Tab moves focus · Esc returns`);
		for (const { sector, button } of sectors) {
			const priority = all === sector ? 'All' : state.coverage.priorities[sector];
			text(button, `${SECTOR_NAMES[sector]} · ${all && all !== sector ? `Held (${priority})` : priority}`);
			button.setAttribute('aria-pressed', String(selected === sector));
		}
		for (const { priority, button } of priorities) {
			button.disabled = !available() || (all !== undefined && all !== selected);
			button.setAttribute('aria-pressed', String((all === selected ? 'all' : state.coverage.priorities[selected]) === priority));
		}
		text(find('h3'), `${SECTOR_NAMES[selected]} coverage`);
		text(find('.coverage-override'), all ? `All → ${SECTOR_NAMES[all]}. Other sectors held. Select ${SECTOR_NAMES[all]} and choose Off, Low, Normal or High to release; saved priorities resume.` : 'Priority requests allocation; craft may still be inbound.');
		const readiness = coverageReadiness(state, selected);
		text(find('.coverage-readiness'), `${readiness.onStation} on station · ${readiness.inbound} inbound · ${readiness.unavailable} unavailable (bay / launching / returning)`);
	};
	return { select: function (sector: Sector) { selected = sector; update(); focusSector(); }, update, direction, enter, focus: focusSector, back: function () { if (row.contains(document.activeElement)) focusSector(); else close(); }, reset: function () { selected = 'ahead'; } };
};
