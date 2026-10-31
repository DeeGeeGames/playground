import { createRadarTracker, radarPoint, RADAR_LONG_RANGE, RADAR_SHORT_RANGE, type RadarContact } from './radar-model';
import { SENSOR_CONFIG, sensorRanges } from './sensors';
import { coverageFor, REPAIR_CREWS, MAX_HULL, setPriority, type Point, type State } from './simulation';
import { worldPoint } from './space';
import { priorityCoverage } from './play-screen';

interface RadarCallbacks { close: () => void; pause: () => void; repair: () => void; selectedMount: () => number }
const text = function (target: Element, value: string) { if (target.textContent !== value) target.textContent = value; };
const node = function <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', content = ''): HTMLElementTagNameMap[K] {
	const element = document.createElement(tag); element.className = className; element.textContent = content; return element;
};
const svgNode = function <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] { return document.createElementNS('http://www.w3.org/2000/svg', tag); };
const distance = function (point: Point, state: State) { return Math.hypot(point.x - state.ark.x, point.y - state.ark.y); };

export const createRadar = function (host: HTMLElement, getState: () => State, available: () => boolean, callbacks: RadarCallbacks, signal: AbortSignal) {
	const tracker = createRadarTracker();
	let short = false; let selectedId: number | undefined; let contacts: readonly RadarContact[] = [];
	host.classList.add('radar-screen'); host.setAttribute('aria-label', 'Tactical radar');
	const surface = node('div', 'radar-surface'); host.append(surface);
	const top = node('header', 'radar-top');
	const title = node('div'); title.append(node('strong', '', 'GATEWARD / TACTICAL'), node('small', '', 'SENSOR ARRAY · HEADING UP'));
	const live = node('span', 'radar-live'); top.append(title, live); surface.append(top);
	const vitals = node('div', 'radar-vitals'); surface.append(vitals);
	const toolbar = node('div', 'radar-toolbar'); const heading = node('h2'); const scales = node('div', 'radar-scales'); scales.setAttribute('role', 'group'); scales.setAttribute('aria-label', 'Radar range');
	const control = function (name: string, action: () => void) { const button = node('button', '', name); button.type = 'button'; button.addEventListener('click', action, { signal }); return button; };
	const longButton = control('LONG · 2 km', function () { short = false; update(); });
	const shortButton = control('SHORT · 700 m', function () { short = true; update(); }); scales.append(longButton, shortButton); toolbar.append(heading, scales); surface.append(toolbar);
	const body = node('div', 'radar-body'); const scope = node('div', 'radar-scope');
	const svg = svgNode('svg'); svg.setAttribute('viewBox', '0 0 440 440'); svg.setAttribute('role', 'group'); svg.setAttribute('aria-label', 'Heading-up radar. Contact list provides keyboard selection.');
	const rings = svgNode('g'); const coverage = svgNode('path'); coverage.classList.add('radar-coverage');
	const noCoverage = svgNode('circle'); noCoverage.classList.add('radar-no-coverage'); noCoverage.setAttribute('cx', '220'); noCoverage.setAttribute('cy', '220'); noCoverage.setAttribute('fill', 'none'); noCoverage.setAttribute('stroke-width', '180');
	const markers = svgNode('g'); const allies = svgNode('g'); const ship = svgNode('path'); ship.setAttribute('d', 'M220 208L225 226L220 222L215 226Z'); ship.classList.add('radar-ally');
	const axes = svgNode('path'); axes.setAttribute('d', 'M40 220H400 M220 40V400'); axes.classList.add('radar-axis');
	svg.append(rings, axes, noCoverage, coverage, allies, markers, ship); scope.append(svg);
	for (const [x, y, label] of [[220, 20, 'BOW / 000°'], [20, 224, '270'], [420, 224, '090'], [220, 426, 'ASTERN / 180°']] as const) {
		const labelNode = svgNode('text'); labelNode.setAttribute('x', String(x)); labelNode.setAttribute('y', String(y)); labelNode.setAttribute('text-anchor', 'middle'); labelNode.textContent = label; svg.append(labelNode);
	}
	const legend = node('p', 'radar-legend'); legend.append(node('span', 'radar-unknown', '◇ Unclassified group'), node('span', 'radar-hostile', '▲ Hostile'), node('span', 'radar-friendly', '● Friendly'), node('span', '', '◌ Last known'));
	scope.append(legend); const notice = node('p', 'radar-notice'); scope.append(notice);
	const detail = node('aside', 'radar-detail'); detail.setAttribute('aria-label', 'Selected radar contact');
	const selectorLabel = node('label', 'radar-selector-label', 'CONTACTS'); const selector = node('select'); selector.id = 'radar-contact-select'; selectorLabel.htmlFor = selector.id; detail.append(selectorLabel, selector);
	selector.addEventListener('change', function () { selectedId = contacts.find(function (contact) { return contact.key === selector.value; })?.ids[0]; update(); }, { signal });
	const contactHeading = node('h3'); const intel = node('p', 'radar-intel'); const readout = node('dl', 'radar-readout');
	const rows = ['Bearing', 'Range', 'Closing', 'Short entry', 'Hull'].map(function (name) { const row = node('div'); const value = node('dd'); row.append(node('dt', '', name), value); readout.append(row); return { name, value, row }; });
	const explanation = node('p', 'radar-explanation');
	const priority = control('Mark priority', function () { const contact = selection(); const id = contact?.ids[0]; if (available() && contact?.age === 0 && id !== undefined) setPriority(getState(), id); update(); });
	const coverageText = node('p', 'radar-explanation');
	detail.append(contactHeading, intel, readout, explanation, priority, coverageText); body.append(scope, detail); surface.append(body);
	const footer = node('footer', 'radar-footer'); const footerText = node('p');
	const actions = node('div', 'radar-actions');
	const repair = control('Assign array crew', function () { callbacks.repair(); update(); });
	const pause = control('Pause', callbacks.pause); const close = control('Battle view · T / Esc', callbacks.close); actions.append(repair, pause, close); footer.append(footerText, actions); surface.append(footer);
	const markerNodes = new Map<string, SVGGElement>();
	const selection = function () { return contacts.find(function (contact) { return selectedId !== undefined && contact.ids.includes(selectedId); }); };
	const contactName = function (contact: RadarContact) { return contact.intel === 'classified' ? `${contact.kind} ${contact.ids[0]}` : 'Unclassified group'; };
	const update = function () {
		const state = getState(); contacts = tracker.observe(state);
		if (host.hidden) return;
		const max = short ? RADAR_SHORT_RANGE : RADAR_LONG_RANGE; const ranges = sensorRanges(state);
		const visible = contacts.filter(function (contact) { return contact.range <= max; });
		if (!selection() || !visible.some(function (contact) { return selectedId !== undefined && contact.ids.includes(selectedId); })) selectedId = visible[0]?.ids[0];
		const selected = selection();
		text(live, state.paused ? 'Ⅱ PAUSED' : state.status === 'fitting' ? 'FITTING' : '● LIVE');
		text(vitals, `HULL ${Math.ceil(state.hull)} / ${MAX_HULL}   ·   SHIELD ${Math.ceil(state.systems.shield.charge)} / ${state.systems.shield.capacity}   ·   ARRAY ${Math.ceil(state.systems.sensors.integrity)}%   ·   SALVAGE ${Math.floor(state.salvage)}`);
		text(heading, short ? 'Short range · combat detail' : 'Long range · early warning'); longButton.setAttribute('aria-pressed', String(!short)); shortButton.setAttribute('aria-pressed', String(short));
		const ringKey = `${max}/${ranges.detection}`;
		if (rings.getAttribute('data-scale') !== ringKey) {
			rings.setAttribute('data-scale', ringKey); rings.replaceChildren();
			for (const fraction of [.25, .5, .75, 1]) { const circle = svgNode('circle'); circle.setAttribute('cx', '220'); circle.setAttribute('cy', '220'); circle.setAttribute('r', String(180 * fraction)); circle.classList.add('radar-ring'); const label = svgNode('text'); label.setAttribute('x', '225'); label.setAttribute('y', String(232 - 180 * fraction)); label.textContent = `${max * fraction} m`; rings.append(circle, label); }
			if (!short) { const boundary = svgNode('circle'); boundary.setAttribute('cx', '220'); boundary.setAttribute('cy', '220'); boundary.setAttribute('r', String(RADAR_SHORT_RANGE / max * 180)); boundary.classList.add('radar-short-boundary'); rings.append(boundary); }
		}
		const reach = Math.min(1, ranges.detection / max) * 180;
		noCoverage.setAttribute('r', String((180 + reach) / 2)); noCoverage.setAttribute('stroke-width', String(180 - reach));
		const mount = state.mounts[callbacks.selectedMount()];
		coverage.setAttribute('d', '');
		if (short && mount?.weapon) {
			const zone = coverageFor(state, mount); const at = radarPoint(state, worldPoint(state, mount), max);
			const arc = Array.from({ length: 33 }, function (_, i) { const angle = zone.center - zone.arc / 2 + zone.arc * i / 32; return radarPoint(state, worldPoint(state, { x: mount.x + Math.cos(angle) * zone.range, y: mount.y + Math.sin(angle) * zone.range }), max); });
			coverage.setAttribute('d', `M${at.x} ${at.y}${arc.map(function (point) { return `L${point.x} ${point.y}`; }).join('')}Z`);
		}
		const keys = new Set(visible.map(function (contact) { return contact.key; }));
		for (const [key, marker] of markerNodes) if (!keys.has(key)) { marker.remove(); markerNodes.delete(key); }
		for (const contact of visible) {
			let marker = markerNodes.get(contact.key);
			if (!marker) { marker = svgNode('g'); marker.setAttribute('role', 'button'); marker.setAttribute('tabindex', '0'); const select = function () { selectedId = contacts.find(function (current) { return current.key === contact.key; })?.ids[0]; update(); }; marker.addEventListener('click', select, { signal }); marker.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } }, { signal }); const ring = svgNode('circle'); ring.setAttribute('r', '14'); const icon = svgNode('path'); marker.append(ring, icon); markers.append(marker); markerNodes.set(contact.key, marker); }
			const point = radarPoint(state, contact.point, max); marker.setAttribute('transform', `translate(${point.x} ${point.y})`); marker.setAttribute('aria-label', `${contactName(contact)}, ${Math.round(contact.bearing)} degrees${contact.age > 0 ? ', last known' : ''}`);
			marker.setAttribute('class', `radar-marker ${contact.intel === 'classified' ? 'classified' : 'detected'}${contact.age > 0 ? ' lost' : ''}${selected?.key === contact.key ? ' selected' : ''}`);
			marker.querySelector('path')?.setAttribute('d', contact.intel === 'classified' ? 'M0 -6L6 5H-6Z' : 'M0 -6L6 0L0 6L-6 0Z');
		}
		allies.replaceChildren();
		for (const escort of state.escorts) if (escort.hp > 0 && distance(escort, state) <= max) { const point = radarPoint(state, escort, max); const icon = svgNode('circle'); icon.setAttribute('cx', String(point.x)); icon.setAttribute('cy', String(point.y)); icon.setAttribute('r', '3'); icon.classList.add('radar-ally'); allies.append(icon); }
		const options = visible.map(function (contact) { return `${contact.key}/${contactName(contact)}/${contact.age > 0}`; }).join('|');
		if (selector.dataset['options'] !== options) { selector.dataset['options'] = options; selector.replaceChildren(); for (const contact of visible) { const option = node('option', '', `${contactName(contact)} · ${Math.round(contact.bearing)}°${contact.age > 0 ? ' · last known' : ''}`); option.value = contact.key; selector.append(option); } }
		for (const option of selector.options) { const contact = visible.find(function (item) { return item.key === option.value; }); if (contact) text(option, `${contactName(contact)} · ${Math.round(contact.bearing)}°${contact.age > 0 ? ' · last known' : ''}`); }
		selector.disabled = visible.length === 0; selector.value = selected?.key ?? '';
		text(contactHeading, selected ? contactName(selected) : 'No contacts');
		text(intel, selected ? selected.age > 0 ? `LAST KNOWN · ${Math.ceil(selected.age)}s ago` : selected.intel === 'classified' ? '▲ CLASSIFIED HOSTILE' : '◇ UNCLASSIFIED GROUP' : 'SCANNING');
		intel.classList.toggle('radar-hostile', selected?.intel === 'classified' && selected.age === 0);
		for (const { name, value, row } of rows) {
			row.hidden = !selected || name === 'Hull' && selected.intel !== 'classified';
			if (!selected) continue;
			const coarse = selected.intel !== 'classified';
			const content = name === 'Bearing' ? `${coarse ? '~' : ''}${Math.round(selected.bearing / (coarse ? 10 : 1)) * (coarse ? 10 : 1)}°` : name === 'Range' ? `${coarse ? '~' : ''}${Math.round(selected.range / (coarse ? 100 : 1)) * (coarse ? 100 : 1)} m` : name === 'Closing' ? selected.age > 0 || selected.closing === undefined ? 'Unknown' : `~${Math.round(selected.closing)} m/s` : name === 'Short entry' ? selected.age > 0 ? 'Unknown' : selected.range <= RADAR_SHORT_RANGE ? 'Inside zone' : selected.entry === undefined ? selected.closing === undefined ? 'Unknown' : 'Not closing' : `~${Math.ceil(selected.entry)} s` : selected.intel === 'classified' ? `${Math.ceil(selected.hull)} / ${selected.maxHull}` : 'Unknown';
			text(value, content);
		}
		text(explanation, !selected ? 'Contacts appear when they enter sensor coverage. Long-range detection stays active in both views.' : selected.age > 0 ? 'Last observed position. This track is not a firing solution and expires after 8 seconds.' : selected.intel === 'classified' ? 'Classification confirmed. Mark priority to focus eligible turrets.' : 'Coarse return. Ship class, exact count, and hull strength are unknown.');
		const isPriority = selected?.ids.some(function (id) { return id === state.priority; });
		text(priority, isPriority ? 'Priority marked ✓' : 'Mark priority'); priority.disabled = !available() || !selected || selected.age > 0;
		text(coverageText, short && mount?.weapon ? `Mount ${callbacks.selectedMount() + 1} · ${mount.weapon} · ${Math.round(coverageFor(state, mount).range)} m. ${priorityCoverage(state, callbacks.selectedMount())}` : 'Priority does not extend weapon range or firing arcs.');
		text(notice, state.systems.sensors.integrity <= 0 ? 'ARRAY OFFLINE · Local automatic defense remains available within 200 m. Repair to recover early warning.' : ranges.detection < RADAR_LONG_RANGE ? `ARRAY IMPAIRED · Detection ${ranges.detection} m; classification ${ranges.classification} m. Shaded space is unobserved, not clear.` : 'BOTH BANDS ACTIVE · Rings show distance from the ark. Amber groups may contain multiple ships.');
		text(footerText, `Detect ${ranges.detection} m · classify ${ranges.classification} m. Scale changes display only.`);
		text(pause, state.paused ? 'Resume' : 'Pause');
		const sensors = state.systems.sensors;
		repair.disabled = !available() || (!(state.repairs['sensors'] ?? 0) && (sensors.integrity >= SENSOR_CONFIG.maxIntegrity || Object.values(state.repairs).reduce(function (sum, crews) { return sum + crews; }, 0) >= REPAIR_CREWS));
		text(repair, (state.repairs['sensors'] ?? 0) > 0 ? `Release array crews (${state.repairs['sensors']})` : 'Assign array crew');
	};
	const reset = function () { tracker.reset(); selectedId = undefined; short = false; };
	const focus = function () { close.focus({ preventScroll: true }); };
	return { update, reset, focus };
};
