import type { CombatEvent } from './simulation';

export type AudioPhase = 'briefing' | 'combat' | 'refit' | 'result';
export type AudioCue = 'focus' | 'confirm' | 'back' | 'unavailable';
export type AudioStatus = 'locked' | 'pending' | 'running' | 'unavailable';
export interface AudioFrame {
	speed: number;
	laser: boolean;
	heat: number;
	active: boolean;
	uiActive?: boolean;
	phase?: AudioPhase;
	intensity?: number;
	danger?: number;
	victory?: boolean;
}
export interface AudioMix { master: number; music: number; effects: number }
export const DEFAULT_AUDIO_MIX: Readonly<AudioMix> = { master: 0.8, music: 0.55, effects: 0.85 };

type Bus = 'music' | 'effects' | 'ui';
interface Voice {
	source: OscillatorNode | AudioBufferSourceNode;
	nodes: AudioNode[];
	bus: Bus;
}
interface Synth {
	context: AudioContext;
	master: GainNode;
	music: GainNode;
	effects: GainNode;
	ui: GainNode;
	musicInput: GainNode;
	effectsInput: GainNode;
	engine: OscillatorNode;
	engineFilter: BiquadFilterNode;
	engineGain: GainNode;
	mechanical: AudioBufferSourceNode;
	mechanicalGain: GainNode;
	laser: OscillatorNode;
	laserFilter: BiquadFilterNode;
	laserGain: GainNode;
	noise: AudioBuffer;
	nodes: AudioNode[];
}
interface Tone {
	at: number;
	frequency: number;
	endFrequency?: number;
	duration: number;
	volume: number;
	type?: OscillatorType;
	attack?: number;
	hold?: number;
	cutoff?: number;
	endCutoff?: number;
	pan?: number;
	detune?: number;
	bus?: Bus;
}
interface Noise {
	at: number;
	duration: number;
	volume: number;
	frequency: number;
	type?: BiquadFilterType;
	pan?: number;
	bus?: Bus;
}
const clamp = function (value: number, low = 0, high = 1) {
	return Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : low;
};
const frequency = function (midi: number) { return 440 * 2 ** ((midi - 69) / 12); };
const SIXTEENTH = 60 / 96 / 4;
const CHORDS = [
	{ root: 38, notes: [50, 57, 60, 64] }, // D minor ninth
	{ root: 34, notes: [50, 53, 57, 60] }, // B-flat major seventh / ninth
	{ root: 41, notes: [48, 53, 57, 64] }, // F major seventh
	{ root: 36, notes: [48, 55, 62, 64] }, // C suspended / added ninth
];
const FIGURE = [0, 2, 1, 3, 2, 1, 3, 2];

// An original, locally synthesized score. The game frame schedules a short
// look-ahead against the audio clock; no timers survive a paused or closed game.
export const createAudio = function () {
	let synth: Synth | undefined;
	let disposed = false;
	let muted = false;
	let active = false;
	let uiActive = false;
	let unlocking = false;
	let unavailable = false;
	let mix: AudioMix = { ...DEFAULT_AUDIO_MIX };
	let phase: AudioPhase = 'combat';
	let intensity = 0;
	let nextWarning = 0;
	let nextMusic = 0;
	let musicStep = 0;
	let musicDuckUntil = 0;
	let lastCue = -10;
	const voices = new Set<Voice>();
	const lastEvent = new Map<CombatEvent, number>();

	const finish = function (voice: Voice) {
		voice.source.onended = null;
		voice.source.disconnect();
		for (const node of voice.nodes) node.disconnect();
		voices.delete(voice);
	};
	const stopVoice = function (voice: Voice) {
		try { voice.source.stop(); } catch { /* A scheduled source can already have ended. */ }
		finish(voice);
	};
	const clearVoices = function (bus?: Bus) {
		for (const voice of voices) if (!bus || voice.bus === bus) stopVoice(voice);
	};
	const register = function (voice: Voice, at: number, duration: number) {
		// Dense battles cannot steal pad voices, and pads cannot steal gun reports.
		const sameBus = [...voices].filter(function (entry) { return entry.bus === voice.bus; });
		if (sameBus.length >= (voice.bus === 'music' ? 48 : voice.bus === 'ui' ? 8 : 40)) {
			const oldest = sameBus[0]; if (oldest) stopVoice(oldest);
		}
		voices.add(voice);
		voice.source.onended = function () { finish(voice); };
		voice.source.start(at);
		voice.source.stop(at + duration + 0.025);
	};
	const envelope = function (gain: GainNode, at: number, duration: number, volume: number, attack = 0.006, hold = 0) {
		const rise = Math.min(attack, duration * 0.4);
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), at + rise);
		gain.gain.setValueAtTime(Math.max(0.0001, volume), at + Math.min(duration * 0.75, rise + hold));
		gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
	};
	const tone = function (sound: Tone) {
		if (!synth) return;
		const { context } = synth;
		const bus = sound.bus ?? 'effects';
		const source = context.createOscillator();
		const gain = context.createGain();
		const filter = context.createBiquadFilter();
		const pan = context.createStereoPanner();
		source.type = sound.type ?? 'sine';
		source.detune.value = sound.detune ?? 0;
		source.frequency.setValueAtTime(Math.max(15, sound.frequency), sound.at);
		if (sound.endFrequency !== undefined) source.frequency.exponentialRampToValueAtTime(Math.max(15, sound.endFrequency), sound.at + sound.duration);
		filter.type = 'lowpass'; filter.Q.value = bus === 'music' ? 0.7 : 0.4;
		filter.frequency.setValueAtTime(sound.cutoff ?? 16000, sound.at);
		if (sound.endCutoff !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(30, sound.endCutoff), sound.at + sound.duration);
		pan.pan.value = sound.pan ?? 0;
		envelope(gain, sound.at, sound.duration, sound.volume, sound.attack, sound.hold);
		source.connect(filter).connect(gain).connect(pan).connect(bus === 'music' ? synth.musicInput : bus === 'ui' ? synth.ui : synth.effectsInput);
		register({ source, nodes: [filter, gain, pan], bus }, sound.at, sound.duration);
	};
	const noise = function (sound: Noise) {
		if (!synth) return;
		const { context } = synth;
		const source = context.createBufferSource();
		const gain = context.createGain();
		const filter = context.createBiquadFilter();
		const pan = context.createStereoPanner();
		const bus = sound.bus ?? 'effects';
		source.buffer = synth.noise; source.loop = true;
		filter.type = sound.type ?? 'lowpass'; filter.Q.value = 0.7;
		filter.frequency.setValueAtTime(sound.frequency, sound.at);
		filter.frequency.exponentialRampToValueAtTime(Math.max(60, sound.frequency * 0.4), sound.at + sound.duration);
		pan.pan.value = sound.pan ?? 0;
		envelope(gain, sound.at, sound.duration, sound.volume);
		source.connect(filter).connect(gain).connect(pan).connect(bus === 'music' ? synth.musicInput : bus === 'ui' ? synth.ui : synth.effectsInput);
		register({ source, nodes: [filter, gain, pan], bus }, sound.at, sound.duration);
	};
	const mixLevels = function () {
		if (!synth) return;
		const at = synth.context.currentTime;
		synth.master.gain.setTargetAtTime(!muted ? mix.master * 0.72 : 0, at, 0.012);
		synth.music.gain.setTargetAtTime(active ? mix.music * (at < musicDuckUntil ? 0.55 : 1) : 0, at, 0.04);
		synth.effects.gain.setTargetAtTime(active ? mix.effects : 0, at, 0.025);
		synth.ui.gain.setTargetAtTime(uiActive ? mix.effects : 0, at, 0.012);
	};
	const setMix = function (value: AudioMix) {
		mix = { master: clamp(value.master), music: clamp(value.music), effects: clamp(value.effects) };
		if (mix.music === 0) clearVoices('music');
		if (mix.effects === 0) { clearVoices('effects'); clearVoices('ui'); }
		mixLevels();
	};
	const setMuted = function (value: boolean) {
		muted = value;
		if (muted) clearVoices();
		mixLevels();
	};
	const reset = function () {
		clearVoices(); lastEvent.clear();
		nextWarning = 0; nextMusic = 0; musicStep = 0; intensity = 0; musicDuckUntil = 0; lastCue = -10;
	};

	const unlock = async function (): Promise<boolean> {
		if (disposed || typeof globalThis.AudioContext !== 'function') { unavailable = true; return false; }
		let opening: AudioContext | undefined;
		unlocking = true; unavailable = false;
		try {
			if (!synth) {
				const context = new AudioContext({ latencyHint: 'interactive' }); opening = context;
				const master = context.createGain(); master.gain.value = 0;
				const compressor = context.createDynamicsCompressor();
				compressor.threshold.value = -16; compressor.knee.value = 15; compressor.ratio.value = 3;
				compressor.attack.value = 0.004; compressor.release.value = 0.18;
				master.connect(compressor).connect(context.destination);
				const music = context.createGain(); music.gain.value = mix.music; music.connect(master);
				const effects = context.createGain(); effects.gain.value = mix.effects; effects.connect(master);
				const ui = context.createGain(); ui.gain.value = 0; ui.connect(master);
				const musicInput = context.createGain(); musicInput.connect(music);
				const effectsInput = context.createGain(); effectsInput.connect(effects);
				// A short, filtered tempo echo gives the score space without an asset download.
				const echoSend = context.createGain(); echoSend.gain.value = 0.13;
				const echo = context.createDelay(1); echo.delayTime.value = SIXTEENTH * 3;
				const echoFilter = context.createBiquadFilter(); echoFilter.frequency.value = 1800;
				const feedback = context.createGain(); feedback.gain.value = 0.26;
				musicInput.connect(echoSend).connect(echo).connect(echoFilter).connect(music);
				echoFilter.connect(feedback).connect(echo);
				const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
				const samples = buffer.getChannelData(0);
				let seed = 84151;
				for (let index = 0; index < samples.length; index++) {
					seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
					samples[index] = seed / 2147483648 - 1;
				}
				const engine = context.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 38;
				const engineFilter = context.createBiquadFilter(); engineFilter.frequency.value = 105;
				const engineGain = context.createGain(); engineGain.gain.value = 0;
				engine.connect(engineFilter).connect(engineGain).connect(effectsInput);
				const mechanical = context.createBufferSource(); mechanical.buffer = buffer; mechanical.loop = true;
				const mechanicalFilter = context.createBiquadFilter(); mechanicalFilter.type = 'bandpass'; mechanicalFilter.frequency.value = 420; mechanicalFilter.Q.value = 1.2;
				const mechanicalGain = context.createGain(); mechanicalGain.gain.value = 0;
				mechanical.connect(mechanicalFilter).connect(mechanicalGain).connect(effectsInput);
				const laser = context.createOscillator(); laser.type = 'sawtooth'; laser.frequency.value = 180;
				const laserFilter = context.createBiquadFilter(); laserFilter.frequency.value = 1250; laserFilter.Q.value = 2;
				const laserGain = context.createGain(); laserGain.gain.value = 0;
				laser.connect(laserFilter).connect(laserGain).connect(effectsInput);
				const nodes = [master, compressor, music, effects, ui, musicInput, effectsInput, echoSend, echo, echoFilter, feedback, engineFilter, engineGain, mechanicalFilter, mechanicalGain, laserFilter, laserGain];
				synth = { context, master, music, effects, ui, musicInput, effectsInput, engine, engineFilter, engineGain, mechanical, mechanicalGain, laser, laserFilter, laserGain, noise: buffer, nodes };
				engine.start(); mechanical.start(); laser.start();
			}
			const current = synth;
			await current.context.resume();
			return !disposed && current.context.state === 'running';
		} catch {
			unavailable = true;
			if (opening && !synth && opening.state !== 'closed') {
				try { await opening.close(); } catch { /* An unavailable device can reject cleanup. */ }
			}
			return false;
		} finally { unlocking = false; }
	};
	const status = function (): AudioStatus {
		if (disposed || unavailable) return 'unavailable';
		if (synth?.context.state === 'running') return 'running';
		return unlocking ? 'pending' : 'locked';
	};
	const cue = function (kind: AudioCue) {
		if (!synth || disposed || !uiActive || muted || mix.effects === 0 || mix.master === 0 || synth.context.state !== 'running') return;
		const at = synth.context.currentTime;
		if (kind === 'focus' && at - lastCue < 0.07) return;
		lastCue = at;
		const note = kind === 'focus' ? 74 : kind === 'confirm' ? 69 : kind === 'back' ? 62 : 45;
		tone({ at, frequency: frequency(note), endFrequency: frequency(note + (kind === 'confirm' ? 7 : kind === 'unavailable' ? -3 : 0)), duration: kind === 'focus' ? 0.055 : 0.16, volume: kind === 'focus' ? 0.065 : 0.1, type: 'triangle', cutoff: 2200, bus: 'ui' });
		if (kind === 'confirm') tone({ at: at + 0.07, frequency: frequency(81), duration: 0.16, volume: 0.06, type: 'sine', bus: 'ui' });
	};
	const footstep = function (side: -1 | 1, strength = 1) {
		if (!synth || disposed || !active || phase !== 'combat' || muted || mix.effects === 0 || mix.master === 0 || synth.context.state !== 'running') return;
		const at = synth.context.currentTime; const weight = 0.65 + clamp(strength) * 0.35;
		tone({ at, frequency: 74, endFrequency: 29, duration: 0.19, volume: 0.24 * weight, pan: side * 0.16 });
		noise({ at, duration: 0.16, volume: 0.12 * weight, frequency: 560, pan: side * 0.16 });
		tone({ at: at + 0.055, frequency: 230, endFrequency: 150, duration: 0.07, volume: 0.045 * weight, type: 'triangle', pan: side * 0.16 });
	};

	const scoreStep = function (at: number, frame: AudioFrame) {
		const bar = Math.floor(musicStep / 16); const beat = musicStep % 16;
		const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length]; if (!chord) return;
		const combat = phase === 'combat';
		const resolved = phase === 'result' && frame.victory;
		const root = resolved ? 38 : chord.root;
		const notes = resolved ? [50, 57, 62, 65] : chord.notes;
		const energy = combat ? intensity : 0;
		if (beat === 0) {
			for (const [index, note] of notes.entries()) {
				tone({ at, frequency: frequency(note), duration: SIXTEENTH * 21, volume: 0.047, type: 'sawtooth', attack: 0.55, hold: 0.9, cutoff: 620 + energy * 420, endCutoff: 340, detune: index % 2 ? 5 : -5, pan: (index - 1.5) * 0.4, bus: 'music' });
			}
			if (!combat) tone({ at, frequency: frequency(root), duration: SIXTEENTH * 22, volume: 0.09, type: 'sine', attack: 0.35, hold: 0.8, bus: 'music' });
		}
		// Sparse answer phrases alternate with the faster combat ostinato.
		const noteEvery = combat && energy > 0.5 ? 2 : 4;
		if (beat % noteEvery === 0) {
			const figureIndex = FIGURE[(Math.floor(beat / 2) + (bar % 4 >= 2 ? 2 : 0)) % FIGURE.length] ?? 0;
			const note = notes[figureIndex] ?? 57;
			tone({ at, frequency: frequency(note + 12), duration: combat ? 0.34 : 0.95, volume: combat ? 0.044 + energy * 0.025 : 0.036, type: 'triangle', attack: 0.015, cutoff: 2100, pan: beat % 8 === 0 ? -0.4 : 0.4, bus: 'music' });
		}
		if (!combat) return;
		if (beat === 0 || beat === 6 || beat === 8 || beat === 14 || (energy > 0.65 && (beat === 3 || beat === 11))) {
			const lift = beat === 14 && bar % 2 === 1 ? 7 : 0;
			tone({ at, frequency: frequency(root + lift), duration: beat === 0 || beat === 8 ? 0.42 : 0.24, volume: 0.16, type: 'sawtooth', cutoff: 360 + energy * 480, endCutoff: 100, bus: 'music' });
			tone({ at, frequency: frequency(root + lift - 12), duration: 0.3, volume: 0.12, bus: 'music' });
		}
		if (energy < 0.12) return;
		if (beat === 0 || beat === 8 || (energy > 0.65 && (beat === 6 || beat === 14))) {
			tone({ at, frequency: 120, endFrequency: 38, duration: 0.25, volume: 0.35, bus: 'music' });
			noise({ at, duration: 0.025, volume: 0.085, frequency: 1700, bus: 'music' });
		}
		if (beat === 4 || beat === 12) {
			noise({ at, duration: 0.19, volume: 0.14 + energy * 0.08, frequency: 1900, type: 'highpass', pan: 0.08, bus: 'music' });
			tone({ at, frequency: 175, endFrequency: 115, duration: 0.14, volume: 0.1, type: 'triangle', bus: 'music' });
			tone({ at: at + 0.015, frequency: 690, endFrequency: 480, duration: 0.08, volume: 0.035, type: 'triangle', pan: -0.15, bus: 'music' });
		}
		if (beat % 2 === 0 || energy > 0.72) noise({ at, duration: beat === 10 ? 0.17 : 0.045, volume: beat % 4 === 2 ? 0.075 : 0.035, frequency: 6700, type: 'highpass', pan: beat % 4 < 2 ? -0.3 : 0.3, bus: 'music' });
		if (bar % 4 === 3 && beat >= 13 && energy > 0.4) tone({ at, frequency: 130 - (beat - 13) * 18, endFrequency: 55, duration: 0.18, volume: 0.15, type: 'triangle', pan: (beat - 14) * 0.25, bus: 'music' });
	};

	const update = function (frame: AudioFrame) {
		active = frame.active;
		uiActive = frame.uiActive ?? frame.active;
		if (!synth || disposed) return;
		const { context, engine, engineFilter, engineGain, mechanicalGain, laser, laserFilter, laserGain } = synth;
		const at = context.currentTime;
		const audible = active && !muted && mix.master > 0 && context.state === 'running';
		const nextPhase = frame.phase ?? 'combat';
		if (phase !== nextPhase) { phase = nextPhase; clearVoices('music'); nextMusic = 0; musicStep = 0; }
		mixLevels();
		const driving = audible && phase === 'combat';
		const speed = clamp(Math.abs(frame.speed) / 90);
		engine.frequency.setTargetAtTime(34 + speed * 31, at, 0.1);
		engineFilter.frequency.setTargetAtTime(95 + speed * 105, at, 0.1);
		engineGain.gain.setTargetAtTime(driving ? 0.035 + speed * 0.055 : 0, at, 0.06);
		mechanicalGain.gain.setTargetAtTime(driving ? speed * 0.045 : 0, at, 0.08);
		laser.frequency.setTargetAtTime(160 + clamp(frame.heat, 0, 100) * 0.7, at, 0.03);
		laserFilter.frequency.setTargetAtTime(780 + clamp(frame.heat, 0, 100) * 8, at, 0.03);
		laserGain.gain.setTargetAtTime(driving && frame.laser ? 0.09 : 0, at, 0.015);
		if (!uiActive) clearVoices('ui');
		if (!audible) { clearVoices('music'); clearVoices('effects'); nextMusic = 0; return; }
		intensity += (clamp(frame.intensity ?? 0.3) - intensity) * 0.025;
		if (nextMusic < at - 0.2 || nextMusic === 0) nextMusic = at + 0.035;
		// Bound catch-up work after a slow frame; normal frames schedule 0–2 notes.
		for (let scheduled = 0; nextMusic < at + 0.16 && scheduled < 4; scheduled++) {
			if (mix.music > 0) scoreStep(nextMusic, frame);
			nextMusic += SIXTEENTH; musicStep++;
		}
		if (driving && mix.effects > 0 && (frame.danger ?? 0) > 0.4 && at >= nextWarning) {
			tone({ at, frequency: 440, duration: 0.13, volume: 0.07, type: 'triangle' });
			tone({ at: at + 0.18, frequency: 330, duration: 0.13, volume: 0.06, type: 'triangle' });
			nextWarning = at + 4;
		}
	};

	const play = function (events: readonly CombatEvent[]) {
		if (!synth || disposed || muted || !active || mix.effects === 0 || mix.master === 0 || synth.context.state !== 'running') return;
		const at = synth.context.currentTime;
		for (const event of events.slice(0, 16)) {
			const previous = lastEvent.get(event) ?? -10;
			const interval = event === 'impact' || event === 'machine-gun' ? 0.07 : event === 'explosion' || event === 'rocket' || event === 'missile' ? 0.1 : 0.03;
			if (at - previous < interval) continue;
			lastEvent.set(event, at);
			switch (event) {
				case 'player-hit':
					musicDuckUntil = at + 0.4;
					tone({ at, frequency: 76, endFrequency: 27, duration: 0.3, volume: 0.4, type: 'triangle' });
					noise({ at, duration: 0.2, volume: 0.32, frequency: 800, type: 'bandpass' });
					break;
				case 'relay-hit':
					musicDuckUntil = at + 0.65;
					tone({ at, frequency: 620, endFrequency: 430, duration: 0.12, volume: 0.12, type: 'triangle' });
					tone({ at: at + 0.17, frequency: 620, endFrequency: 430, duration: 0.18, volume: 0.1, type: 'triangle' });
					break;
				case 'artillery':
					tone({ at, frequency: 880, endFrequency: 330, duration: 0.32, volume: 0.13, type: 'triangle' });
					tone({ at: at + 0.36, frequency: 660, endFrequency: 220, duration: 0.32, volume: 0.1, type: 'triangle' });
					break;
				case 'requisition':
				case 'refit':
					for (const [index, note] of [50, 57, 62].entries()) tone({ at: at + index * 0.14, frequency: frequency(note), duration: 0.6, volume: 0.13, type: 'triangle', attack: 0.02, cutoff: 1400 });
					break;
				case 'machine-gun':
					noise({ at, duration: 0.07, volume: 0.18, frequency: 3400, type: 'bandpass', pan: -0.12 });
					tone({ at, frequency: 160, endFrequency: 75, duration: 0.055, volume: 0.12, type: 'triangle' });
					break;
				case 'ppc':
					tone({ at, frequency: 720, endFrequency: 110, duration: 0.36, volume: 0.21, type: 'sawtooth', cutoff: 2600, endCutoff: 500 });
					tone({ at, frequency: 147, endFrequency: 42, duration: 0.5, volume: 0.3, type: 'triangle' });
					noise({ at: at + 0.015, duration: 0.18, volume: 0.17, frequency: 4200, type: 'bandpass' });
					break;
				case 'rocket':
					noise({ at, duration: 0.25, volume: 0.24, frequency: 980, type: 'bandpass' });
					tone({ at, frequency: 96, endFrequency: 48, duration: 0.18, volume: 0.18, type: 'triangle' });
					break;
				case 'cannon':
					tone({ at, frequency: 145, endFrequency: 27, duration: 0.36, volume: 0.55, type: 'triangle' });
					noise({ at, duration: 0.3, volume: 0.7, frequency: 2200 });
					noise({ at: at + 0.04, duration: 0.4, volume: 0.18, frequency: 500, pan: -0.12 });
					tone({ at: at + 0.19, frequency: 320, endFrequency: 170, duration: 0.09, volume: 0.09, type: 'triangle', pan: 0.15 });
					break;
				case 'missile':
					noise({ at, duration: 0.32, volume: 0.22, frequency: 2400, type: 'bandpass', pan: 0.18 });
					tone({ at, frequency: 115, endFrequency: 420, duration: 0.24, volume: 0.09, type: 'sawtooth', cutoff: 950, pan: -0.18 });
					break;
				case 'impact':
					noise({ at, duration: 0.13, volume: 0.34, frequency: 3600, type: 'bandpass' });
					tone({ at, frequency: 560, endFrequency: 155, duration: 0.11, volume: 0.16, type: 'triangle' });
					tone({ at, frequency: 105, endFrequency: 47, duration: 0.16, volume: 0.16 });
					break;
				case 'explosion':
					noise({ at, duration: 0.8, volume: 0.75, frequency: 1600 });
					tone({ at, frequency: 105, endFrequency: 23, duration: 0.65, volume: 0.55 });
					noise({ at: at + 0.14, duration: 0.7, volume: 0.28, frequency: 520, pan: 0.2 });
					noise({ at: at + 0.28, duration: 0.35, volume: 0.12, frequency: 3200, type: 'bandpass', pan: -0.25 });
					break;
				case 'coolant':
					noise({ at, duration: 0.95, volume: 0.33, frequency: 4800, type: 'highpass', pan: -0.25 });
					noise({ at: at + 0.06, duration: 0.8, volume: 0.28, frequency: 3600, type: 'bandpass', pan: 0.25 });
					tone({ at, frequency: 780, endFrequency: 260, duration: 0.4, volume: 0.07 });
					break;
				case 'pickup':
					for (const [index, note] of [74, 81, 86].entries()) tone({ at: at + index * 0.085, frequency: frequency(note), duration: 0.24, volume: 0.12, type: 'triangle', cutoff: 2200 });
					break;
				case 'overheat':
					for (let index = 0; index < 3; index++) tone({ at: at + index * 0.19, frequency: 230, endFrequency: 195, duration: 0.12, volume: 0.15, type: 'square', cutoff: 850 });
					noise({ at, duration: 0.7, volume: 0.13, frequency: 2400, type: 'highpass' });
					break;
				case 'wave':
					noise({ at, duration: 0.075, volume: 0.08, frequency: 1800, type: 'bandpass' });
					tone({ at, frequency: frequency(62), duration: 0.2, volume: 0.15, type: 'triangle' });
					tone({ at: at + 0.23, frequency: frequency(69), duration: 0.45, volume: 0.13, type: 'triangle' });
					break;
				case 'victory':
					for (const [index, note] of [62, 65, 69, 74].entries()) tone({ at: at + index * 0.16, frequency: frequency(note), duration: 0.85, volume: 0.14, type: 'triangle', attack: 0.025, cutoff: 1800, pan: (index - 1.5) * 0.15 });
					break;
				case 'defeat':
					tone({ at, frequency: frequency(50), endFrequency: frequency(38), duration: 1.2, volume: 0.22, type: 'sawtooth', cutoff: 600, endCutoff: 130 });
					tone({ at: at + 0.3, frequency: frequency(45), endFrequency: frequency(33), duration: 1, volume: 0.16, type: 'triangle' });
					noise({ at, duration: 0.9, volume: 0.13, frequency: 1400 });
					break;
			}
		}
	};

	const dispose = async function () {
		if (disposed) return;
		disposed = true; active = false; clearVoices();
		if (!synth) return;
		const current = synth; synth = undefined;
		for (const source of [current.engine, current.mechanical, current.laser]) {
			source.stop(); source.disconnect();
		}
		for (const node of current.nodes) node.disconnect();
		if (current.context.state !== 'closed') await current.context.close();
	};
	return { unlock, status, cue, footstep, setMuted, setMix, reset, update, play, dispose };
};
