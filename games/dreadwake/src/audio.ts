import { clamp, type CombatEvent } from './simulation';

export type AudioScene = 'menu' | 'combat' | 'refit' | 'victory' | 'defeat' | 'paused';
export interface AudioMix { master: number; music: number; effects: number }

// Original synthesized score: a 16-bar minor-key motif with separate harmonic,
// pulse and percussion layers. Every voice is owned and cancelled on suspension.
export const createAudio = function () {
	let context: AudioContext | undefined;
	let master: GainNode | undefined; let effects: GainNode | undefined; let music: GainNode | undefined;
	let engine: OscillatorNode | undefined; let sub: OscillatorNode | undefined; let engineGain: GainNode | undefined;
	let lance: OscillatorNode | undefined; let lanceGain: GainNode | undefined;
	let noise: AudioBuffer | undefined; let muted = false; let disposed = false; let active = false; let unavailable = false;
	let scene: AudioScene = 'menu'; let intensity = 0; let mix: AudioMix = { master: 0.75, music: 0.55, effects: 0.8 };
	let musicStep = 0; let nextNote = 0; let scheduler: ReturnType<typeof setInterval> | undefined;
	const voices = new Set<AudioScheduledSourceNode>(); const last = new Map<CombatEvent, number>();
	const clearVoices = function () {
		for (const voice of voices) { try { voice.stop(); } catch { /* A stopped scheduled source needs no further work. */ } }
		voices.clear();
	};
	const volume = function () {
		if (!context || !master || !effects || !music) return;
		master.gain.setTargetAtTime(active && !muted && scene !== 'paused' ? mix.master * 0.6 : 0, context.currentTime, 0.025);
		effects.gain.setTargetAtTime(mix.effects, context.currentTime, 0.04);
		music.gain.setTargetAtTime(mix.music * (scene === 'combat' ? 0.8 : 1), context.currentTime, 0.12);
	};
	const envelope = function (source: AudioScheduledSourceNode, output: AudioNode, bus: AudioNode,
		duration: number, level: number, at: number, attack = 0.008) {
		if (!context) return;
		const gain = context.createGain();
		gain.gain.setValueAtTime(0, context.currentTime); gain.gain.setValueAtTime(0.0001, at);
		gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), at + Math.min(attack, duration * 0.4));
		gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
		output.connect(gain); gain.connect(bus); voices.add(source);
		source.onended = function () { voices.delete(source); source.disconnect(); output.disconnect(); gain.disconnect(); };
		source.start(at); source.stop(at + duration);
	};
	const tone = function (frequency: number, end: number, duration: number, level: number,
		type: OscillatorType = 'triangle', delay = 0) {
		if (!context || !effects || muted || !active || context.state !== 'running') return;
		const oscillator = context.createOscillator(); const at = context.currentTime + delay;
		oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, at);
		oscillator.frequency.exponentialRampToValueAtTime(end, at + duration);
		envelope(oscillator, oscillator, effects, duration, level, at);
	};
	const burst = function (frequency: number, duration: number, level: number) {
		if (!context || !effects || !noise || muted || !active || context.state !== 'running') return;
		const source = context.createBufferSource(); source.buffer = noise; source.loop = true;
		const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 0.8;
		filter.frequency.setValueAtTime(frequency, context.currentTime);
		filter.frequency.exponentialRampToValueAtTime(70, context.currentTime + duration);
		source.connect(filter); envelope(source, filter, effects, duration, level, context.currentTime);
	};
	const note = function (semitone: number, duration: number, level: number, at: number, pad = false) {
		if (!context || !music) return;
		const oscillator = context.createOscillator(); oscillator.type = pad ? 'sine' : 'triangle';
		oscillator.frequency.value = 82.4069 * 2 ** (semitone / 12);
		oscillator.detune.value = pad ? -4 : 2;
		const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = pad ? 1200 : 2200;
		oscillator.connect(filter); envelope(oscillator, filter, music, duration, level, at, pad ? 0.35 : 0.012);
	};
	const percussion = function (at: number, strong: boolean) {
		if (!context || !music || !noise) return;
		if (strong) {
			const oscillator = context.createOscillator(); oscillator.type = 'sine';
			oscillator.frequency.setValueAtTime(100, at); oscillator.frequency.exponentialRampToValueAtTime(32, at + 0.22);
			envelope(oscillator, oscillator, music, 0.3, 0.14, at);
		} else {
			const source = context.createBufferSource(); source.buffer = noise;
			const filter = context.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 4500;
			source.connect(filter); envelope(source, filter, music, 0.065, 0.032, at);
		}
	};
	const scheduleMusic = function () {
		if (!context || !music || !active || muted || scene === 'paused' || context.state !== 'running') return;
		if (nextNote < context.currentTime - 0.15) nextNote = context.currentTime + 0.025;
		const beat = 60 / (scene === 'combat' ? 86 : 70); const eighth = beat / 2;
		const roots = [0, -4, -7, -2, 0, -4, -7, -5];
		const melody = [12, undefined, 19, 22, undefined, 19, 15, undefined, 12, undefined, 10, undefined, 7, undefined, 10, 14,
			12, undefined, 19, undefined, 22, 24, 22, undefined, 19, undefined, 15, 14, 12, undefined, undefined, undefined];
		while (nextNote < context.currentTime + 0.2) {
			const step = musicStep % 64; const chord = Math.floor(step / 8); const root = roots[chord] ?? 0;
			if (step % 8 === 0) {
				const major = chord === 1 || chord === 3 || chord === 5 || chord === 7;
				for (const interval of [0, major ? 4 : 3, 7]) note(root + interval + 12, beat * 5, 0.032, nextNote, true);
				note(root - 12, beat * 3.5, 0.075, nextNote, true);
			}
			const melodic = melody[step % melody.length];
			if (melodic !== undefined && scene !== 'defeat') note(melodic + 12, eighth * 2.7, scene === 'combat' ? 0.034 : 0.052, nextNote);
			if (scene === 'combat') {
				if (step % 2 === 0) note(root + (step % 4 === 0 ? 0 : 7), eighth * 0.75, 0.08 + intensity * 0.035, nextNote);
				if (step % 4 === 0 || intensity > 0.45) percussion(nextNote, step % 4 === 0);
			}
			if (scene === 'victory' && step % 8 === 0) note(root + 31, beat * 2.5, 0.048, nextNote);
			musicStep++; nextNote += eighth;
		}
	};
	const silence = function () {
		active = false;
		if (!context || !master) return;
		master.gain.setTargetAtTime(0, context.currentTime, 0.015);
		lanceGain?.gain.setTargetAtTime(0, context.currentTime, 0.025);
		clearVoices(); nextNote = context.currentTime + 0.03;
	};
	return {
		status: function (): 'locked' | 'ready' | 'unavailable' {
			return disposed || unavailable || typeof AudioContext === 'undefined' ? 'unavailable' : context?.state === 'running' ? 'ready' : 'locked';
		},
		unlock: async function () {
			if (disposed || typeof AudioContext === 'undefined') { unavailable = true; return false; }
			try {
				if (!context) {
					context = new AudioContext(); master = context.createGain(); master.gain.value = 0;
					effects = context.createGain(); music = context.createGain(); effects.connect(master); music.connect(master);
					const compressor = context.createDynamicsCompressor(); compressor.threshold.value = -15;
					compressor.knee.value = 18; compressor.ratio.value = 5; compressor.attack.value = 0.003; compressor.release.value = 0.18;
					master.connect(compressor); compressor.connect(context.destination);
					noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
					const samples = noise.getChannelData(0); let seed = 17;
					for (let i = 0; i < samples.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; samples[i] = seed / 2147483648 - 1; }
					engine = context.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 29;
					sub = context.createOscillator(); sub.type = 'sine'; sub.frequency.value = 49;
					const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 110;
					engineGain = context.createGain(); engineGain.gain.value = 0;
					engine.connect(filter); sub.connect(filter); filter.connect(engineGain); engineGain.connect(effects); engine.start(); sub.start();
					lance = context.createOscillator(); lance.type = 'sawtooth'; lance.frequency.value = 114;
					const lanceFilter = context.createBiquadFilter(); lanceFilter.type = 'bandpass'; lanceFilter.frequency.value = 430; lanceFilter.Q.value = 1.8;
					lanceGain = context.createGain(); lanceGain.gain.value = 0;
					lance.connect(lanceFilter); lanceFilter.connect(lanceGain); lanceGain.connect(effects); lance.start();
					scheduler = setInterval(scheduleMusic, 80);
				}
				// Browsers may keep resume() pending when a gamepad poll is not a user
				// activation. Report the locked state without hanging the interface;
				// a later real key/pointer gesture can call resume() again.
				const current = context;
				let timeout: ReturnType<typeof setTimeout> | undefined;
				try {
					await Promise.race([current.resume(), new Promise<void>(function (resolve) { timeout = setTimeout(resolve, 250); })]);
				} finally { if (timeout !== undefined) clearTimeout(timeout); }
				volume(); scheduleMusic(); return current.state === 'running';
			} catch { unavailable = true; return false; }
		},
		setMuted: function (value: boolean) { muted = value; if (value) { clearVoices(); } volume(); },
		setMix: function (value: AudioMix) {
			mix = { master: clamp(value.master, 0, 1), music: clamp(value.music, 0, 1), effects: clamp(value.effects, 0, 1) }; volume();
		},
		setScene: function (value: AudioScene, danger = 0) {
			if (disposed) return;
			if (scene !== value) {
				scene = value;
				if (value === 'paused') { silence(); return; }
				musicStep = 0; clearVoices(); nextNote = (context?.currentTime ?? 0) + 0.04;
			}
			active = value !== 'paused'; intensity = clamp(danger, 0, 1); volume();
			if (value !== 'combat' && context) {
				engineGain?.gain.setTargetAtTime(0, context.currentTime, 0.15); lanceGain?.gain.setTargetAtTime(0, context.currentTime, 0.03);
			}
		},
		setBeam: function (value: boolean) {
			if (!context || !lanceGain || !lance) return;
			lanceGain.gain.setTargetAtTime(value && active && scene === 'combat' ? 0.075 : 0, context.currentTime, 0.035);
			lance.frequency.setTargetAtTime(value ? 126 : 114, context.currentTime, 0.8);
		},
		cue: function (kind: 'focus' | 'confirm' | 'back') {
			if (kind === 'focus') tone(420, 540, 0.055, 0.045, 'sine');
			else if (kind === 'confirm') { tone(520, 780, 0.12, 0.07, 'sine'); tone(1040, 1040, 0.2, 0.045, 'sine', 0.06); }
			else tone(420, 250, 0.11, 0.055, 'sine');
		},
		update: function (speed: number, engaged: boolean, events: readonly CombatEvent[]) {
			if (!engaged) { silence(); return; }
			active = true;
			if (!context || !master || !engine || !engineGain || !sub) return;
			const at = context.currentTime; const power = clamp(speed / 86, 0, 1); volume();
			engine.frequency.setTargetAtTime(28 + power * 22, at, 0.3); sub.frequency.setTargetAtTime(49 + power * 15, at, 0.3);
			engineGain.gain.setTargetAtTime(scene === 'combat' ? 0.028 + power * 0.06 : 0, at, 0.3);
			for (const event of events) {
				const spacing = event === 'rattler' ? 0.1 : event === 'spark' || event === 'ion' || event === 'hit' ? 0.14 : event === 'helios' ? 0.3 : 0.07;
				if (at - (last.get(event) ?? -1) < spacing) continue;
				last.set(event, at);
				if (event === 'cannon') { tone(130, 24, 0.55, 0.48, 'sine'); burst(1800, 0.28, 0.3); tone(920, 150, 0.09, 0.08, 'sawtooth'); }
				if (event === 'rail') { tone(190, 28, 0.24, 0.2, 'sine'); tone(1800, 220, 0.12, 0.065, 'triangle'); burst(3400, 0.11, 0.12); }
				if (event === 'flak') { burst(1400, 0.18, 0.15); tone(110, 48, 0.15, 0.1, 'triangle'); }
				if (event === 'rattler') { burst(2400, 0.045, 0.065); tone(150, 80, 0.045, 0.045, 'triangle'); }
				if (event === 'spark') { tone(1100, 580, 0.075, 0.075, 'sine'); tone(2200, 1000, 0.045, 0.026, 'triangle'); }
				if (event === 'helios') { tone(85, 33, 0.72, 0.22, 'sine'); tone(720, 170, 0.42, 0.095, 'sawtooth'); burst(2100, 0.31, 0.12); }
				if (event === 'ion') { tone(310, 1400, 0.08, 0.065, 'triangle'); tone(1060, 440, 0.12, 0.048, 'sine', 0.045); }
				if (event === 'torpedo') { burst(1200, 0.45, 0.18); tone(90, 240, 0.38, 0.14, 'sawtooth'); }
				if (event === 'missile') { burst(2800, 0.23, 0.12); tone(180, 920, 0.24, 0.08, 'triangle'); }
				if (event === 'beam') { tone(90, 720, 0.7, 0.12, 'sawtooth'); tone(1280, 640, 0.22, 0.07, 'sine'); }
				if (event === 'intercept') { burst(5400, 0.065, 0.08); tone(1800, 700, 0.055, 0.045, 'square'); }
				if (event === 'hit') { burst(3600, 0.18, 0.2); tone(420, 95, 0.2, 0.1, 'square'); }
				if (event === 'damage') { burst(800, 0.45, 0.4); tone(65, 22, 0.4, 0.27, 'sawtooth'); }
				if (event === 'explosion') { burst(1500, 1.6, 0.6); tone(85, 15, 1.4, 0.5, 'sine'); }
				if (event === 'wave') { tone(220, 220, 0.35, 0.12, 'sine'); tone(330, 330, 0.45, 0.12, 'sine', 0.13); tone(440, 440, 0.6, 0.1, 'sine', 0.26); }
				if (event === 'shield') { tone(180, 900, 0.6, 0.16, 'sine'); tone(370, 740, 0.8, 0.1); }
				if (event === 'shield-hit') { tone(1100, 280, 0.24, 0.17, 'sine'); burst(2600, 0.15, 0.1); }
				if (event === 'alert') { tone(740, 600, 0.16, 0.1, 'sine'); tone(740, 600, 0.16, 0.1, 'sine', 0.23); }
				if (event === 'ready') { tone(660, 880, 0.14, 0.09, 'sine'); tone(990, 1320, 0.22, 0.07, 'sine', 0.12); }
			}
		},
		dispose: async function () {
			disposed = true; if (scheduler !== undefined) clearInterval(scheduler); silence(); engine?.stop(); sub?.stop(); lance?.stop();
			if (context && context.state !== 'closed') { try { await context.close(); } catch { /* Device may already be gone. */ } }
		},
	};
};
