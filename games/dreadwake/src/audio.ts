import { clamp, type CombatEvent } from './simulation';

export const createAudio = function () {
	let context: AudioContext | undefined; let master: GainNode | undefined;
	let engine: OscillatorNode | undefined; let sub: OscillatorNode | undefined; let engineGain: GainNode | undefined;
	let noise: AudioBuffer | undefined; let muted = false; let disposed = false; let active = false;
	const voices = new Set<AudioScheduledSourceNode>(); const last = new Map<CombatEvent, number>();
	const clearVoices = function () { for (const voice of voices) voice.stop(); voices.clear(); };
	const envelope = function (source: AudioScheduledSourceNode, output: AudioNode, duration: number, volume: number, delay: number) {
		if (!context || !master) return;
		const gain = context.createGain(); const at = context.currentTime + delay;
		gain.gain.setValueAtTime(0, context.currentTime); gain.gain.setValueAtTime(0.001, at);
		gain.gain.linearRampToValueAtTime(volume, at + 0.008); gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
		output.connect(gain); gain.connect(master); voices.add(source);
		source.onended = function () { voices.delete(source); source.disconnect(); output.disconnect(); gain.disconnect(); };
		source.start(at); source.stop(at + duration);
	};
	const tone = function (frequency: number, end: number, duration: number, volume: number, type: OscillatorType = 'triangle', delay = 0) {
		if (!context || !master || muted || !active || context.state !== 'running') return;
		const oscillator = context.createOscillator(); const at = context.currentTime + delay;
		oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at); oscillator.frequency.exponentialRampToValueAtTime(end, at + duration);
		envelope(oscillator, oscillator, duration, volume, delay);
	};
	const burst = function (frequency: number, duration: number, volume: number) {
		if (!context || !master || !noise || muted || !active || context.state !== 'running') return;
		const source = context.createBufferSource(); source.buffer = noise; source.loop = true;
		const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 0.8;
		filter.frequency.setValueAtTime(frequency, context.currentTime); filter.frequency.exponentialRampToValueAtTime(70, context.currentTime + duration);
		source.connect(filter); envelope(source, filter, duration, volume, 0);
	};
	const silence = function () {
		if (!context || !master) return;
		master.gain.setTargetAtTime(0, context.currentTime, 0.015); clearVoices();
	};
	return {
		unlock: async function () {
			if (disposed || typeof AudioContext === 'undefined') return false;
			try {
				if (!context) {
					context = new AudioContext(); master = context.createGain(); master.gain.value = 0;
					const compressor = context.createDynamicsCompressor(); compressor.threshold.value = -12; compressor.ratio.value = 4;
					master.connect(compressor); compressor.connect(context.destination);
					noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
					const samples = noise.getChannelData(0); let seed = 17;
					for (let i = 0; i < samples.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; samples[i] = seed / 2147483648 - 1; }
					engine = context.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 29;
					sub = context.createOscillator(); sub.type = 'sine'; sub.frequency.value = 49;
					const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 110;
					engineGain = context.createGain(); engineGain.gain.value = 0.035;
					engine.connect(filter); sub.connect(filter); filter.connect(engineGain); engineGain.connect(master); engine.start(); sub.start();
				}
				await context.resume(); return context.state === 'running';
			} catch { return false; }
		},
		setMuted: function (value: boolean) { muted = value; if (value) silence(); },
		update: function (speed: number, engaged: boolean, events: readonly CombatEvent[]) {
			active = engaged;
			if (!context || !master || !engine || !engineGain || !sub) return;
			const at = context.currentTime; const power = clamp(speed / 86, 0, 1);
			master.gain.setTargetAtTime(active && !muted ? 0.42 : 0, at, 0.02);
			engine.frequency.setTargetAtTime(28 + power * 22, at, 0.3); sub.frequency.setTargetAtTime(49 + power * 15, at, 0.3);
			engineGain.gain.setTargetAtTime(0.035 + power * 0.055, at, 0.3);
			if (!active) { clearVoices(); return; }
			for (const event of events) {
				if (at - (last.get(event) ?? -1) < 0.07) continue;
				last.set(event, at);
				if (event === 'cannon') { tone(130, 24, 0.55, 0.48, 'sine'); burst(1800, 0.28, 0.3); tone(920, 150, 0.09, 0.08, 'sawtooth'); }
				if (event === 'torpedo') { burst(1200, 0.45, 0.18); tone(90, 240, 0.38, 0.14, 'sawtooth'); }
				if (event === 'intercept') { burst(5400, 0.065, 0.08); tone(1800, 700, 0.055, 0.045, 'square'); }
				if (event === 'hit') { burst(3600, 0.18, 0.2); tone(420, 95, 0.2, 0.1, 'square'); }
				if (event === 'damage') { burst(800, 0.45, 0.45); tone(65, 22, 0.4, 0.3, 'sawtooth'); }
				if (event === 'explosion') { burst(1500, 1.6, 0.6); tone(85, 15, 1.4, 0.5, 'sine'); }
				if (event === 'wave') { tone(220, 220, 0.35, 0.12, 'sine'); tone(330, 330, 0.45, 0.12, 'sine', 0.13); tone(440, 440, 0.6, 0.1, 'sine', 0.26); }
				if (event === 'shield') { tone(180, 900, 0.6, 0.16, 'sine'); tone(370, 740, 0.8, 0.1); }
				if (event === 'shield-hit') { tone(1100, 280, 0.24, 0.17, 'sine'); burst(2600, 0.15, 0.1); }
				if (event === 'alert') { tone(740, 600, 0.16, 0.1, 'sine'); tone(740, 600, 0.16, 0.1, 'sine', 0.23); }
				if (event === 'ready') { tone(660, 880, 0.14, 0.09, 'sine'); tone(990, 1320, 0.22, 0.07, 'sine', 0.12); }
			}
		},
		dispose: async function () {
			disposed = true; active = false; silence(); engine?.stop(); sub?.stop();
			if (context && context.state !== 'closed') { try { await context.close(); } catch { /* Device may already be gone. */ } }
		},
	};
};
