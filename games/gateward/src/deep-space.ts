import { Mesh, PlaneGeometry, ShaderMaterial, Vector3, type Scene } from 'three';
import type { View } from './projection';

// One distant plane gives the orthographic tactical view a stable celestial
// horizon, without textures, post-processing or screen-sized transparent layers.
export const createDeepSpace = function (scene: Scene) {
	const aspect = { value: 1 };
	const material = new ShaderMaterial({
		depthWrite: false, depthTest: false,
		uniforms: { aspect },
		vertexShader: `varying vec2 vUv;
		void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
		fragmentShader: `varying vec2 vUv;
		uniform float aspect;
		float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
		float noise(vec2 p) {
			vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
			return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
		}
		float cloud(vec2 p) { return noise(p) * 0.53 + noise(p * 2.07) * 0.27 + noise(p * 4.13) * 0.13 + noise(p * 8.3) * 0.07; }
		void main() {
			vec2 uv = vec2(vUv.x * aspect, vUv.y);
			vec3 color = vec3(0.006, 0.011, 0.019);
			float gas = cloud(uv * 3.2 + vec2(7.1, 2.8));
			float band = exp(-pow((uv.y - 0.28 - uv.x * 0.27) * 2.8, 2.0));
			color += vec3(0.012, 0.024, 0.028) * gas * band;
			color += vec3(0.037, 0.028, 0.018) * pow(gas, 3.0) * (1.0 - band) * 0.65;
			vec2 center = vec2(aspect * 0.91, 0.94);
			vec2 p = (uv - center) / 0.36;
			float r = length(p);
			vec3 sun = normalize(vec3(-0.75, 0.55, 0.5));
			float atmosphere = exp(-abs(r - 1.0) * 75.0);
			color += vec3(0.055, 0.135, 0.16) * atmosphere * (0.18 + max(dot(normalize(vec3(p, 0.18)), sun), 0.0));
			if (r < 1.0) {
				vec3 normal = vec3(p, sqrt(max(0.0, 1.0 - r * r)));
				float light = max(dot(normal, sun), 0.0);
				float terrain = cloud(p * 5.5 + vec2(12.4, 4.1));
				float swirls = cloud(p * 12.0 + terrain * 3.0);
				vec3 surface = mix(vec3(0.035, 0.067, 0.083), vec3(0.15, 0.18, 0.17), smoothstep(0.43, 0.66, terrain));
				surface += vec3(0.09, 0.12, 0.13) * smoothstep(0.54, 0.8, swirls);
				vec3 planet = surface * (0.06 + light * 0.7);
				planet += vec3(0.10, 0.21, 0.24) * pow(1.0 - normal.z, 4.0) * light;
				color = mix(color, planet, (1.0 - smoothstep(0.994, 1.0, r)));
			}
			float vignette = 1.0 - 0.22 * length(vUv - 0.5);
			gl_FragColor = vec4(color * vignette, 1.0);
			#include <colorspace_fragment>
		}`,
	});
	const vista = new Mesh(new PlaneGeometry(1, 1), material); vista.name = 'Distant planetary horizon'; vista.frustumCulled = false; vista.renderOrder = -100; scene.add(vista);
	const lower = new Vector3(); const upper = new Vector3();
	return function (view: View) {
		lower.set(-1, -1, 0).applyMatrix4(view.camera.projectionMatrixInverse);
		upper.set(1, 1, 0).applyMatrix4(view.camera.projectionMatrixInverse);
		const width = upper.x - lower.x; const height = upper.y - lower.y;
		aspect.value = width / Math.max(1, height);
		vista.position.set((lower.x + upper.x) / 2, (lower.y + upper.y) / 2, -view.camera.far * 0.9).applyMatrix4(view.camera.matrixWorld);
		vista.quaternion.copy(view.camera.quaternion); vista.scale.set(width, height, 1);
	};
};
