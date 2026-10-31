import { toScreen, type View } from './projection';
import { contactIntel } from './sensors';
import type { Point, State } from './simulation';

// A fixed presentation radius, not a detection or weapon range boundary.
export const TACTICAL_RING_RADIUS = 440;
const SECTORS = 72;
type Intel = 'classified' | 'detected';
export interface RingContact { readonly point: Point; readonly intel: Intel; readonly count: number }

export const ringContacts = function (state: State): readonly RingContact[] {
	const groups = new Map<string, { x: number; y: number; intel: Intel; count: number }>();
	for (const enemy of state.enemies) {
		if (enemy.hp <= 0) continue;
		const intel = contactIntel(state, enemy);
		if (intel === 'unseen') continue;
		const dx = enemy.x - state.ark.x; const dy = enemy.y - state.ark.y;
		const distance = Math.hypot(dx, dy);
		if (distance === 0) continue; // A coincident contact has no bearing.
		const angle = Math.atan2(dy, dx);
		const sector = ((Math.round(angle * SECTORS / (Math.PI * 2)) % SECTORS) + SECTORS) % SECTORS;
		const key = `${sector}/${intel}`;
		const group = groups.get(key);
		if (group) { group.x += dx / distance; group.y += dy / distance; group.count++; }
		else groups.set(key, { x: dx / distance, y: dy / distance, intel, count: 1 });
	}
	return Array.from(groups.values(), function (group) {
		const angle = Math.atan2(group.y, group.x);
		return { point: { x: state.ark.x + Math.cos(angle) * TACTICAL_RING_RADIUS, y: state.ark.y + Math.sin(angle) * TACTICAL_RING_RADIUS }, intel: group.intel, count: group.count };
	});
};

export const ringLayout = function (state: State, view: View) {
	const center = toScreen(state.ark, view);
	const outline = Array.from({ length: 97 }, function (_, index) {
		const angle = index * Math.PI * 2 / 96;
		return toScreen({ x: state.ark.x + Math.cos(angle) * TACTICAL_RING_RADIUS, y: state.ark.y + Math.sin(angle) * TACTICAL_RING_RADIUS }, view);
	});
	const extentX = Math.max(...outline.map(function (point) { return Math.abs(point.x - center.x); }));
	const extentY = Math.max(...outline.map(function (point) { return Math.abs(point.y - center.y); }));
	// Leave room for marker lanes and count labels; the halo carries no distance scale.
	const scale = Math.max(0, Math.min(1, (center.x - 30) / extentX, (view.width - center.x - 30) / extentX, (center.y - 30) / extentY, (view.height - center.y - 30) / extentY));
	const fit = function (point: Point): Point { return { x: center.x + (point.x - center.x) * scale, y: center.y + (point.y - center.y) * scale }; };
	return {
		outline: outline.map(fit),
		contacts: ringContacts(state).map(function (contact) {
			const at = fit(toScreen(contact.point, view));
			const angle = Math.atan2(at.y - center.y, at.x - center.x);
			// Separate intel categories even when their bearings coincide.
			const lane = contact.intel === 'classified' ? -8 : 8;
			return { ...contact, point: { x: at.x + Math.cos(angle) * lane, y: at.y + Math.sin(angle) * lane }, angle };
		}),
	};
};

export const drawTacticalRing = function (ctx: CanvasRenderingContext2D, state: State, view: View): void {
	const layout = ringLayout(state, view);
	ctx.save();
	ctx.strokeStyle = '#73c3e966'; ctx.lineWidth = 1;
	ctx.setLineDash([2, 5]); ctx.beginPath();
	for (const [index, at] of layout.outline.entries()) {
		if (index === 0) ctx.moveTo(at.x, at.y); else ctx.lineTo(at.x, at.y);
	}
	ctx.stroke(); ctx.setLineDash([]);
	for (const contact of layout.contacts) {
		const at = contact.point;
		ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(contact.angle);
		ctx.beginPath();
		if (contact.intel === 'classified') { ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); }
		else { ctx.moveTo(6, 0); ctx.lineTo(0, -6); ctx.lineTo(-6, 0); ctx.lineTo(0, 6); }
		ctx.closePath(); ctx.fillStyle = contact.intel === 'classified' ? '#ff8b82' : '#101d29';
		ctx.strokeStyle = contact.intel === 'classified' ? '#101d29' : '#edbc7e'; ctx.lineWidth = 2;
		ctx.fill(); ctx.stroke(); ctx.restore();
		if (contact.count > 1) {
			ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center';
			ctx.lineWidth = 3; ctx.strokeStyle = '#080f19'; ctx.fillStyle = '#deeaef';
			ctx.strokeText(String(contact.count), at.x, at.y - 10); ctx.fillText(String(contact.count), at.x, at.y - 10);
		}
	}
	ctx.restore();
};
