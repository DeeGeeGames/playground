import type { Point } from './simulation';

export interface LabelObstacle { left: number; top: number; right: number; bottom: number }

// Measure the actual responsive HUD, including transient messages and training.
// Both renderers use these bounds so labels cannot disappear behind a DOM card.
export const hudObstacles = function (canvas: HTMLCanvasElement): LabelObstacle[] {
	const origin = canvas.getBoundingClientRect();
	const nodes = canvas.parentElement?.querySelectorAll<HTMLElement>('.mission, .utility, .hull, .target-panel, .cockpit, .field-message, .training-guide, .save-notice');
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
