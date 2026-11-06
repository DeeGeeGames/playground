import type { CombatEvent } from './simulation';
type Actuator = Pick<GamepadHapticActuator, 'playEffect' | 'reset'>;
interface FeedbackDevice extends Pick<Gamepad, 'index' | 'id' | 'connected'> { vibrationActuator?: Actuator }

// Optional browser hardware support. Device failures never interrupt combat.
export const createControllerFeedback = function () {
	let actuator: Actuator | undefined;
	let device: string | undefined;
	let lastPulse = -Infinity;
	const stop = async function () {
		const current = actuator;
		if (!current || typeof current.reset !== 'function') return;
		try { await current.reset(); } catch { /* Disconnection can reject reset. */ }
	};
	const update = function (pad: FeedbackDevice | undefined, enabled: boolean) {
		const next = enabled && pad?.connected ? `${pad.index}:${pad.id}` : undefined;
		if (next === device) return;
		void stop(); device = next; actuator = undefined; lastPulse = -Infinity;
		if (!next || !pad) return;
		try { if (typeof pad.vibrationActuator?.playEffect === 'function') actuator = pad.vibrationActuator; } catch { /* Haptics may be unavailable under browser policy. */ }
	};
	const play = function (events: readonly CombatEvent[], now: number) {
		if (!actuator || now - lastPulse < 75) return;
		const damage = events.includes('player-hit'); const cannon = events.includes('cannon'); const missiles = events.includes('missile');
		if (!damage && !cannon && !missiles) return;
		lastPulse = now;
		try {
			void actuator.playEffect('dual-rumble', { duration: damage ? 140 : cannon ? 65 : 90, startDelay: 0, strongMagnitude: damage ? 0.55 : 0.25, weakMagnitude: damage ? 0.3 : 0.15 }).catch(function () { /* Unsupported effects are optional. */ });
		} catch { /* Some drivers throw synchronously. */ }
	};
	const dispose = async function () { await stop(); actuator = undefined; device = undefined; };
	return { update, play, stop, dispose };
};
