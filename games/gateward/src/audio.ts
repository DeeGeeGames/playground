import type { Sound } from './audio-events';

export const createAudio = function () {
	let context: AudioContext | undefined; let master: GainNode | undefined;
	let noise: AudioBuffer | undefined; let muted = false; let disposed = false; let active = true;
	const voices = new Set<AudioScheduledSourceNode>(); const last = new Map<Sound, number>();
	const clearVoices = function () { for (const voice of voices) voice.stop(); voices.clear(); };
	const envelope = function (source: AudioScheduledSourceNode, output: AudioNode, duration: number, volume: number, delay: number) {
		if (!context || !master || voices.size >= 32) { source.disconnect(); output.disconnect(); return; }
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
	const play = function (event: Sound) {
		if (!context || muted || !active || context.state !== 'running') return;
		const at = context.currentTime;
		if (at - (last.get(event) ?? -10) < (event === 'damage' ? 0.3 : 0.09)) return;
		last.set(event, at);
		if (event === 'flak') { burst(2800, 0.12, 0.19); tone(150, 45, 0.13, 0.13, 'triangle'); }
		if (event === 'rail') { tone(1700, 90, 0.19, 0.12, 'sawtooth'); tone(95, 25, 0.5, 0.28, 'sine'); burst(5000, 0.07, 0.18); }
		if (event === 'missile') { burst(1500, 0.55, 0.22); tone(80, 250, 0.35, 0.08, 'sawtooth'); }
		if (event === 'escort') { tone(950, 320, 0.08, 0.045, 'triangle'); }
		if (event === 'impact') { burst(2200, 0.16, 0.09); tone(240, 80, 0.12, 0.06, 'triangle'); }
		if (event === 'damage') { burst(700, 0.4, 0.25); tone(70, 27, 0.4, 0.22, 'sine'); }
		if (event === 'explosion') { burst(1300, 0.85, 0.3); tone(85, 18, 0.8, 0.28, 'sine'); }
		if (event === 'pulse') { tone(100, 800, 0.7, 0.16, 'sine'); tone(210, 1050, 0.8, 0.08); burst(2200, 0.5, 0.1); }
		if (event === 'contact') { tone(440, 440, 0.2, 0.1, 'sine'); tone(330, 330, 0.3, 0.1, 'sine', 0.24); }
		if (event === 'clear' || event === 'repair') { tone(330, 330, 0.25, 0.08, 'sine'); tone(495, 495, 0.35, 0.08, 'sine', 0.15); }
		if (event === 'depart' || event === 'won') { tone(165, 165, 0.65, 0.12, 'sine'); tone(247.5, 247.5, 0.65, 0.1, 'sine', 0.18); tone(330, 330, 0.9, 0.1, 'sine', 0.36); }
		if (event === 'lost') { burst(600, 1.5, 0.3); tone(110, 27.5, 1.8, 0.2, 'sine'); }
		if (event === 'order') { tone(520, 780, 0.1, 0.065, 'sine'); }
	};
	return {
		play,
		unlock: async function () {
			if (disposed || typeof AudioContext === 'undefined') return;
			try {
				if (!context) {
					context = new AudioContext(); master = context.createGain(); master.gain.value = active && !muted ? 0.42 : 0;
					const compressor = context.createDynamicsCompressor(); compressor.threshold.value = -12; compressor.ratio.value = 4;
					master.connect(compressor); compressor.connect(context.destination);
					noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
					const samples = noise.getChannelData(0); let seed = 17;
					for (let i = 0; i < samples.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; samples[i] = seed / 2147483648 - 1; }
				}
				if (context.state === 'suspended') await context.resume();
			} catch { /* Audio is optional if the browser or device denies playback. */ }
		},
		setActive: function (value: boolean) {
			active = value;
			if (!value) silence();
			else if (context && master) master.gain.setTargetAtTime(muted ? 0 : 0.42, context.currentTime, 0.02);
		},
		setMuted: function (value: boolean) {
			muted = value;
			if (value) silence();
			else if (context && master) master.gain.setTargetAtTime(active ? 0.42 : 0, context.currentTime, 0.02);
		},
		reset: function () { silence(); last.clear(); },
		dispose: async function () {
			disposed = true; active = false; silence();
			if (context && context.state !== 'closed') { try { await context.close(); } catch { /* Device may already be gone. */ } }
		},
	};
};
