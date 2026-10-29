import type { Camera } from './projection';

// Cache the static atmospheric layer at CSS resolution. Stars provide lightweight parallax.
export const createBackdrop = function () {
	const layer = document.createElement('canvas');
	return function (ctx: CanvasRenderingContext2D, width: number, height: number, camera: Camera) {
		if (layer.width !== Math.round(width) || layer.height !== Math.round(height)) {
			layer.width = Math.round(width); layer.height = Math.round(height);
			const sky = layer.getContext('2d'); if (!sky) return;
			sky.fillStyle = '#050b19'; sky.fillRect(0, 0, width, height);
			for (let i = 0; i < 22; i++) {
				const x = width * (0.2 + i * 0.04); const y = height * (0.85 - i * 0.035) + Math.sin(i * 2.5) * height * 0.12;
				const r = width * (0.16 + Math.sin(i * 1.8) * 0.06);
				const cloud = sky.createRadialGradient(x, y, 0, x, y, r);
				cloud.addColorStop(0, i % 3 === 0 ? '#7753a51a' : '#276f8e16'); cloud.addColorStop(1, '#00000000');
				sky.fillStyle = cloud; sky.fillRect(x - r, y - r, r * 2, r * 2);
			}
			const x = width * 0.83; const y = height * 0.24; const r = Math.min(width * 0.17, height * 0.29);
			const halo = sky.createRadialGradient(x, y, r * 0.95, x, y, r * 1.12);
			halo.addColorStop(0, '#4a88b040'); halo.addColorStop(1, '#19294200');
			sky.fillStyle = halo; sky.beginPath(); sky.arc(x, y, r * 1.12, 0, Math.PI * 2); sky.fill();
			sky.save(); sky.beginPath(); sky.arc(x, y, r, 0, Math.PI * 2); sky.clip();
			const planet = sky.createLinearGradient(x - r, y - r, x + r * 0.4, y + r * 0.3);
			planet.addColorStop(0, '#446c87'); planet.addColorStop(0.2, '#263f5c'); planet.addColorStop(0.6, '#111c31'); planet.addColorStop(1, '#070e1c');
			sky.fillStyle = planet; sky.fillRect(x - r, y - r, r * 2, r * 2);
			for (let i = 0; i < 35; i++) {
				sky.strokeStyle = i % 3 === 0 ? '#7291a70b' : '#030a1c14'; sky.lineWidth = 2 + i % 4;
				sky.beginPath(); sky.ellipse(x - r * 0.35, y - r + i * r * 0.07, r * 1.5, r * 0.14, -0.3, 0, Math.PI * 2); sky.stroke();
			}
			sky.restore();
			const vignette = sky.createRadialGradient(width * 0.5, height * 0.42, height * 0.15, width * 0.5, height * 0.42, Math.max(width, height) * 0.7);
			vignette.addColorStop(0, '#00000000'); vignette.addColorStop(1, '#01050dcc'); sky.fillStyle = vignette; sky.fillRect(0, 0, width, height);
		}
		ctx.drawImage(layer, 0, 0);
		for (let i = 0; i < 260; i++) {
			const depth = 0.02 + i % 4 * 0.022;
			const x = ((Math.sin(i * 127.1) * 43758.5453 - camera.center.x * depth) % width + width) % width;
			const y = ((Math.cos(i * 311.7) * 32719.281 - camera.center.y * depth) % height + height) % height;
			ctx.fillStyle = i % 9 === 0 ? '#c5e4ef85' : '#7192af45'; ctx.fillRect(x, y, i % 9 === 0 ? 1.6 : 0.8, i % 9 === 0 ? 1.6 : 0.8);
		}
	};
};
