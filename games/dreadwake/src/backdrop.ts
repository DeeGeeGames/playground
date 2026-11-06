import type { Camera } from './projection';
import { CEL } from './visual-theme';

// Cache the solid-color sky. Sparse stars supply motion without competing
// with weapon trails, while large quiet shapes preserve the Cel Fleet palette.
export const createBackdrop = function () {
	const layer = document.createElement('canvas');
	return function (ctx: CanvasRenderingContext2D, width: number, height: number, camera: Camera) {
		if (layer.width !== Math.round(width) || layer.height !== Math.round(height)) {
			layer.width = Math.round(width); layer.height = Math.round(height);
			const sky = layer.getContext('2d'); if (!sky) return;
			sky.fillStyle = CEL.sky; sky.fillRect(0, 0, width, height);
			sky.beginPath(); sky.moveTo(0, height * 0.75);
			sky.bezierCurveTo(width * 0.3, height * 0.26, width * 0.56, height * 0.6, width, height * 0.12);
			sky.lineTo(width, height * 0.43);
			sky.bezierCurveTo(width * 0.6, height * 0.86, width * 0.26, height * 0.5, 0, height);
			sky.closePath(); sky.fillStyle = CEL.cloud; sky.fill();
			const x = width * 0.91; const y = height * 0.15; const r = Math.min(width * 0.20, height * 0.31);
			sky.save(); sky.beginPath(); sky.arc(x, y, r, 0, Math.PI * 2); sky.clip();
			sky.fillStyle = CEL.planet; sky.fillRect(x - r, y - r, r * 2, r * 2);
			sky.beginPath(); sky.moveTo(x + r * 0.12, y - r);
			sky.bezierCurveTo(x + r * 0.58, y - r * 0.4, x + r * 0.65, y + r * 0.35, x - r * 0.06, y + r);
			sky.lineTo(x + r, y + r); sky.lineTo(x + r, y - r); sky.closePath(); sky.fillStyle = CEL.planetShade; sky.fill();
			for (const offset of [-0.2, 0.18]) {
				sky.beginPath(); sky.moveTo(x - r * 1.2, y + r * offset);
				sky.quadraticCurveTo(x, y + r * (offset - 0.35), x + r * 1.2, y + r * (offset - 0.16));
				sky.strokeStyle = CEL.cloud; sky.lineWidth = r * 0.07; sky.stroke();
			}
			sky.restore(); sky.beginPath(); sky.arc(x, y, r, 0, Math.PI * 2); sky.strokeStyle = CEL.ink; sky.lineWidth = 2; sky.stroke();
		}
		ctx.drawImage(layer, 0, 0);
		for (let i = 0; i < 105; i++) {
			const depth = 0.02 + i % 3 * 0.025;
			const x = ((Math.sin(i * 127.1) * 43758.5453 - camera.center.x * depth) % width + width) % width;
			const y = ((Math.cos(i * 311.7) * 32719.281 - camera.center.y * depth) % height + height) % height;
			ctx.fillStyle = i % 9 === 0 ? CEL.muted : CEL.side;
			ctx.globalAlpha = i % 9 === 0 ? 0.65 : 0.4;
			ctx.fillRect(x, y, i % 9 === 0 ? 1.6 : 1, i % 9 === 0 ? 1.6 : 1);
		}
		ctx.globalAlpha = 1;
	};
};
