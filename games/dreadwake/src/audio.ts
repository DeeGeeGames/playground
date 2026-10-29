import { clamp, type CombatEvent } from './simulation';

export const createAudio = function () {
	let context: AudioContext | undefined; let master: GainNode | undefined;
	let engine: OscillatorNode | undefined; let engineGain: GainNode | undefined;
	let muted = false; let disposed = false; let active = false;
	const voices = new Set<OscillatorNode>(); const last = new Map<CombatEvent, number>();
	const clearVoices = function () { for (const voice of voices) voice.stop(); voices.clear(); };
	const tone = function (frequency: number, end: number, duration: number, volume: number, type: OscillatorType = 'triangle') {
		if (!context || !master || muted || !active || context.state !== 'running') return;
		const oscillator = context.createOscillator(); const gain = context.createGain(); const at = context.currentTime;
		oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at); oscillator.frequency.exponentialRampToValueAtTime(end, at + duration);
		gain.gain.setValueAtTime(0.001, at); gain.gain.linearRampToValueAtTime(volume, at + 0.009); gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
		oscillator.connect(gain); gain.connect(master); voices.add(oscillator);
		oscillator.onended = function () { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
		oscillator.start(at); oscillator.stop(at + duration);
	};
	return {
		unlock: async function () {
			if (disposed || typeof AudioContext === 'undefined') return false;
			try {
				if (!context) {
					context = new AudioContext(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
					engine = context.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 29;
					const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 100;
					engineGain = context.createGain(); engineGain.gain.value = 0.05;
					engine.connect(filter); filter.connect(engineGain); engineGain.connect(master); engine.start();
				}
				await context.resume(); return context.state === 'running';
			} catch { return false; }
		},
		setMuted: function (value: boolean) { muted = value; if (value) clearVoices(); },
		update: function (speed: number, engaged: boolean, events: readonly CombatEvent[]) {
			active = engaged;
			if (!context || !master || !engine || !engineGain) return;
			const at = context.currentTime;
			master.gain.setTargetAtTime(active && !muted ? 0.3 : 0, at, 0.02);
			engine.frequency.setTargetAtTime(28 + clamp(speed / 86, 0, 1) * 18, at, 0.3);
			engineGain.gain.setTargetAtTime(0.03 + clamp(speed / 86, 0, 1) * 0.04, at, 0.3);
			if (!active) { clearVoices(); return; }
			for (const event of events) {
				if (at - (last.get(event) ?? -1) < 0.07) continue;
				last.set(event, at);
				if (event === 'cannon') { tone(120, 24, 0.5, 0.7); tone(75, 20, 0.26, 0.1, 'sawtooth'); }
				if (event === 'hit') tone(250, 58, 0.15, 0.2, 'square');
				if (event === 'damage') { tone(65, 22, 0.35, 0.4, 'sawtooth'); tone(370, 85, 0.2, 0.12); }
				if (event === 'explosion') { tone(85, 15, 1.2, 0.6, 'sawtooth'); tone(47, 12, 1.4, 0.4); }
				if (event === 'wave') { tone(330, 440, 0.3, 0.15, 'sine'); }
			}
		},
		dispose: async function () {
			disposed = true; active = false; clearVoices(); engine?.stop();
			if (context && context.state !== 'closed') { try { await context.close(); } catch { /* Device may already be gone. */ } }
		},
	};
};
