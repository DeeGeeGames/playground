import type { Point } from './simulation';

export interface LabelObstacle { left: number; top: number; right: number; bottom: number }

// Keep the bearing on the ray from the cruiser to the contact, including when
// part of that ray is covered by a panel (or by a thumb control in landscape).
export const projectBearing = function (origin: Point, contact: Point, width: number, height: number, hud: readonly LabelObstacle[], marker: 'contact' | 'heading' = 'contact'): { visible: boolean; point: Point } | undefined {
	const obscured = function (x: number, y: number, margin: number) {
		return hud.some(function (box) {
			return x + margin > box.left && x - margin < box.right && y + margin > box.top && y - margin < box.bottom;
		});
	};
	if (contact.x >= 8 && contact.x <= width - 8 && contact.y >= 8 && contact.y <= height - 8 && !obscured(contact.x, contact.y, 0)) return { visible: true, point: contact };
	const dx = contact.x - origin.x;
	const dy = contact.y - origin.y;
	const distance = Math.hypot(dx, dy);
	if (distance < 1) return;
	const padding = 16;
	const fractionX = dx === 0 ? Infinity : ((dx > 0 ? width - padding : padding) - origin.x) / dx;
	const fractionY = dy === 0 ? Infinity : ((dy > 0 ? height - padding : padding) - origin.y) / dy;
	const limit = Math.min(1, fractionX, fractionY) * distance;
	for (let along = limit; along >= padding; along -= 10) {
		const x = origin.x + dx * along / distance;
		const y = origin.y + dy * along / distance;
		if (!obscured(x, y, 10)) return { visible: false, point: { x, y } };
	}
	if (marker === 'heading') return;
	const fallback = clearLabelPosition(contact, 20, 20, hud, width, height);
	return fallback ? { visible: false, point: fallback } : undefined;
};

// Measure the actual responsive HUD, including transient messages and training.
// Both renderers use these bounds so labels cannot disappear behind a DOM card.
export const hudObstacles = function (canvas: HTMLCanvasElement): LabelObstacle[] {
	const origin = canvas.getBoundingClientRect();
	const nodes = canvas.parentElement?.querySelectorAll<HTMLElement>('.brand, .mission, .utility, .hull, .salvage, .arsenal-readout, .throttle-control, .rudder-control, .tactical-controls, .field-message, .training-guide, .save-notice');
	if (!nodes) return [];
	return Array.from(nodes).filter(function (node) { return node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'; }).map(function (node) {
		const rect = node.getBoundingClientRect();
		return { left: rect.left - origin.left - 5, top: rect.top - origin.top - 5, right: rect.right - origin.left + 5, bottom: rect.bottom - origin.top + 5 };
	});
};

export const clearLabelPosition = function (point: Point, width: number, height: number, obstacles: readonly LabelObstacle[], viewportWidth: number, viewportHeight: number): Point | undefined {
	for (const distance of [0, 28, 56, 84, 112, 140, 180]) {
		for (const [dx, dy] of distance === 0 ? [[0, 0]] as const : [[0, -distance], [0, distance], [-distance, 0], [distance, 0]] as const) {
			const x = Math.min(viewportWidth - width / 2 - 8, Math.max(width / 2 + 8, point.x + dx));
			const y = Math.min(viewportHeight - height / 2 - 8, Math.max(height / 2 + 8, point.y + dy));
			if (x - width / 2 < 0 || y - height / 2 < 0) continue;
			const blocked = obstacles.some(function (box) { return x + width / 2 > box.left && x - width / 2 < box.right && y + height / 2 > box.top && y - height / 2 < box.bottom; });
			if (!blocked) return { x, y };
		}
	}
	return undefined;
};
