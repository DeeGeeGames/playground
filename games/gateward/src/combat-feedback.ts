import { BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, SphereGeometry } from 'three';
import { DECK_HEIGHT } from './projection';
import { effectHeight } from './projectiles-3d';
import type { Effect, State } from './simulation';

export const COMBAT_EFFECT_LIMIT = 128;

// A fixed pool bounds draw calls and GPU allocations even during dense 2× combat.
// These objects never enter the picking registry or the simulation.
export const createCombatVisual = function () {
	const root = new Group();
	const material = function (color: string) { return new MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false, side: DoubleSide }); };
	const ring = new Mesh(new RingGeometry(0.85, 1, 24), material('#8cdbff'));
	ring.rotation.x = -Math.PI / 2; root.add(ring);
	const core = new Mesh(new SphereGeometry(1, 8, 6), material('#ffb87b')); root.add(core);
	const shards = Array.from({ length: 6 }, function (_, i) {
		const shard = new Mesh(new BoxGeometry(1, 1, 1), material(i % 2 ? '#ffe2ae' : '#9eb3c4'));
		root.add(shard); return shard;
	});
	return { root, update: function (effect: Effect, state: State, reducedMotion: boolean) {
		const feedback = effect.feedback;
		const remaining = Math.max(0, effect.life / effect.maxLife);
		const age = 1 - remaining;
		root.position.set(effect.x, feedback?.kind === 'impact' ? feedback.deck ? DECK_HEIGHT : effectHeight(effect, state) : effectHeight(effect, state), effect.y);
		ring.material.depthTest = !feedback;
		ring.visible = !feedback || feedback.kind === 'impact' && feedback.shield > 0;
		core.visible = feedback?.kind === 'destruction' || feedback?.kind === 'impact' && feedback.hull > 0;
		ring.scale.setScalar(feedback ? 12 + (reducedMotion ? 0 : age * 12) : effect.radius * (0.3 + (reducedMotion ? 0.35 : age * 0.7)));
		ring.material.color.set(feedback ? '#8cdbff' : effect.color); ring.material.opacity = remaining * 0.75;
		const destruction = feedback?.kind === 'destruction';
		core.scale.setScalar(destruction ? effect.radius * (reducedMotion ? 0.2 : 0.12 + age * 0.22) : 3 + age * 3);
		core.material.color.set(effect.color); core.material.opacity = remaining * (reducedMotion ? 0.45 : 0.85);
		for (const [i, shard] of shards.entries()) {
			// Armor throws a lateral fan of sparks; penetration retains a solid core.
			shard.visible = destruction || feedback?.kind === 'impact' && feedback.armor > 0;
			const angle = i * Math.PI / 3;
			const spread = reducedMotion ? 0.35 : 0.15 + age;
			const radius = destruction ? effect.radius : 16;
			shard.position.set(Math.cos(angle) * radius * spread, destruction ? (i % 3 - 1) * radius * spread * 0.4 : 0, Math.sin(angle) * radius * spread);
			shard.rotation.set(0, angle, reducedMotion ? 0 : age * 2);
			shard.scale.set(destruction ? 4 : 8, 1.5, 2);
			shard.material.opacity = remaining * 0.8;
		}
	} };
};
