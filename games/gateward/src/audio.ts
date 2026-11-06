import type { Sound } from './audio-events';
import { pitch, SCORES, type AudioScene } from './audio-score';

export type { AudioScene } from './audio-score';
export interface AudioMix { music: number; effects: number }
type Bus = 'music' | 'effects' | 'engine';
interface Voice {
	source: AudioScheduledSourceNode;
	gain: GainNode;
	nodes: readonly AudioNode[];
	bus: Bus;
	startAt: number;
	ended: boolean;
}
interface Synth {
	context: AudioContext;
	master: GainNode;
	music: GainNode;
	musicInput: GainNode;
	effects: GainNode;
	nodes: readonly AudioNode[];
	noise: AudioBuffer;
}

const normalized = function (value: number | undefined, fallback: number): number {
	return value !== undefined && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
};

// Everything is synthesized locally after a gesture. The score has its own
// audio-clock scheduler; game speed never changes its pitch or tempo.
export const createAudio = function () {
	let synth: Synth | undefined;
	let muted = false; let disposed = false; let active = true;
	let scene: AudioScene = 'fitting';
	let mix: AudioMix = { music: 0.65, effects: 0.8 };
	let timer: ReturnType<typeof setTimeout> | undefined;
	let nextBeat = 0; let beat = 0; let nextEngine = 0;
	const voices = new Set<Voice>();
	const last = new Map<Sound, number>();
	const audible = function (): boolean { return !!synth && !disposed && !muted && active && synth.context.state === 'running'; };
	const finish = function (voice: Voice) {
		if (voice.ended) return;
		voice.ended = true; voice.source.onended = null;
		voice.source.disconnect(); voice.gain.disconnect();
		for (const node of voice.nodes) node.disconnect();
		voices.delete(voice);
	};
	const stop = function (voice: Voice, fade = 0) {
		if (voice.ended) return;
		// A queued note has no audible tail. Cancel it outright instead of
		// replacing its future envelope with a fade that could start it early.
		if (fade && synth && voice.startAt < synth.context.currentTime) {
			const now = synth.context.currentTime;
			const level = voice.gain.gain.value;
			voice.gain.gain.cancelScheduledValues(now);
			voice.gain.gain.setValueAtTime(level, now);
			voice.gain.gain.linearRampToValueAtTime(0, now + fade);
			try { voice.source.stop(now + fade); } catch { finish(voice); }
			return;
		}
		try { voice.source.stop(); } catch { /* The device may have already ended this source. */ }
		finish(voice);
	};
	const clear = function (bus?: Bus, fade = 0) {
		for (const voice of voices) if (bus === undefined || voice.bus === bus) stop(voice, fade);
	};
	const register = function (source: AudioScheduledSourceNode, output: AudioNode, nodes: readonly AudioNode[], bus: Bus, at: number, duration: number, volume: number, attack = 0.006) {
		if (!synth) return;
		const count = [...voices].filter(function (voice) { return voice.bus === bus; }).length;
		if (count >= (bus === 'effects' ? 32 : bus === 'music' ? 32 : 4)) {
			source.disconnect(); for (const node of nodes) node.disconnect(); return;
		}
		const gain = synth.context.createGain();
		gain.gain.value = 0;
		gain.gain.setValueAtTime(0, at);
		gain.gain.linearRampToValueAtTime(volume, at + Math.min(attack, duration * 0.4));
		gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
		gain.gain.linearRampToValueAtTime(0, at + duration + 0.02);
		output.connect(gain);
		gain.connect(bus === 'music' ? synth.musicInput : synth.effects);
		const voice: Voice = { source, gain, nodes, bus, startAt: at, ended: false };
		voices.add(voice); source.onended = function () { finish(voice); };
		source.start(at); source.stop(at + duration + 0.03);
	};
	const tone = function (frequency: number, end: number, duration: number, volume: number, type: OscillatorType = 'sine', delay = 0) {
		if (!synth || !audible() || mix.effects === 0) return;
		const { context } = synth; const at = context.currentTime + delay;
		const source = context.createOscillator(); source.type = type;
		source.frequency.setValueAtTime(frequency, at); source.frequency.exponentialRampToValueAtTime(end, at + duration);
		const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 3600;
		source.connect(filter); register(source, filter, [filter], 'effects', at, duration, volume);
	};
	const burst = function (frequency: number, duration: number, volume: number, delay = 0) {
		if (!synth || !audible() || mix.effects === 0) return;
		const { context, noise } = synth; const at = context.currentTime + delay;
		const source = context.createBufferSource(); source.buffer = noise; source.loop = true;
		const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 0.7;
		filter.frequency.setValueAtTime(frequency, at); filter.frequency.exponentialRampToValueAtTime(65, at + duration);
		source.connect(filter); register(source, filter, [filter], 'effects', at, duration, volume);
	};
	const note = function (midi: number, at: number, duration: number, volume: number, pan: number, pad = false) {
		if (!synth || mix.music === 0) return;
		const { context } = synth;
		const source = context.createOscillator(); source.type = pad ? 'triangle' : 'sine';
		source.frequency.value = pitch(midi); source.detune.value = pad ? pan * 5 : 0;
		const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 0.4;
		filter.frequency.setValueAtTime(SCORES[scene].color * (pad ? 0.6 : 1), at);
		filter.frequency.exponentialRampToValueAtTime(220, at + duration);
		const stereo = context.createStereoPanner(); stereo.pan.value = pan;
		source.connect(filter).connect(stereo);
		register(source, stereo, [filter, stereo], 'music', at, duration, volume, pad ? 0.8 : 0.025);
	};
	const scoreStep = function (at: number) {
		const score = SCORES[scene]; const eighth = 30 / score.tempo;
		const chord = score.chords[Math.floor(beat / 16) % score.chords.length];
		if (!chord) return;
		if (beat % 16 === 0) chord.forEach(function (midi, index) { note(midi, at, eighth * 19, 0.052, (index - 1.5) * 0.4, true); });
		const root = chord[0];
		if (score.pulse && root !== undefined && beat % 4 === 0) note(root - 12, at, eighth * 3.5, scene === 'tension' ? 0.11 : 0.075, 0);
		const melody = score.melody[beat % score.melody.length];
		if (melody !== null && melody !== undefined) {
			const phraseShift = Math.floor(beat / 64) % 2 === 0 ? 0 : -12;
			note(melody + phraseShift, at, eighth * 3.7, 0.075, 0.12);
			note(melody + phraseShift, at + eighth * 1.5, eighth * 3, 0.021, -0.5);
		}
		if (scene === 'tension' && beat % 2 === 1) {
			const arpeggio = chord[Math.floor(beat / 2) % chord.length];
			if (arpeggio !== undefined) note(arpeggio + 12, at, eighth * 1.7, 0.033, beat % 4 === 1 ? -0.4 : 0.4);
		}
	};
	const engine = function (at: number) {
		if (!synth || mix.effects === 0 || (scene !== 'transit' && scene !== 'tension')) return;
		const source = synth.context.createBufferSource(); source.buffer = synth.noise; source.loop = true;
		const filter = synth.context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = scene === 'tension' ? 105 : 82; filter.Q.value = 0.8;
		source.connect(filter); register(source, filter, [filter], 'engine', at, 3.4, 0.13, 0.8);
	};
	const tick = function () {
		timer = undefined;
		if (!synth || !audible()) return;
		const now = synth.context.currentTime;
		// Never catch up an old queue after suspension or a long browser stall.
		if (nextBeat < now - 0.1) nextBeat = now + 0.04;
		while (nextBeat < now + 0.3) { scoreStep(nextBeat); nextBeat += 30 / SCORES[scene].tempo; beat++; }
		if (nextEngine < now) { engine(now); nextEngine = now + 2.4; }
		timer = setTimeout(tick, 100);
	};
	const startClock = function () { if (timer === undefined && audible()) tick(); };
	const silence = function () {
		if (timer !== undefined) clearTimeout(timer); timer = undefined;
		if (synth) { synth.master.gain.cancelScheduledValues(synth.context.currentTime); synth.master.gain.setTargetAtTime(0, synth.context.currentTime, 0.008); }
		clear(); nextBeat = 0; nextEngine = 0;
	};
	const restore = function () {
		if (!synth || !audible()) return;
		synth.master.gain.cancelScheduledValues(synth.context.currentTime);
		synth.master.gain.setTargetAtTime(0.55, synth.context.currentTime, 0.035);
		startClock();
	};
	const play = function (event: Sound) {
		if (!synth || !audible() || mix.effects === 0) return;
		const at = synth.context.currentTime;
		if (at - (last.get(event) ?? -10) < (event === 'damage' ? 0.35 : event === 'beam' ? 0.18 : 0.1)) return;
		last.set(event, at);
		if (event === 'beam') { tone(540, 410, 0.28, 0.055); tone(1080, 820, 0.2, 0.018); }
		if (event === 'flak') { burst(2700, 0.13, 0.19); tone(150, 48, 0.16, 0.16, 'triangle'); }
		if (event === 'rail') { tone(1450, 160, 0.19, 0.09, 'triangle'); tone(92, 26, 0.65, 0.3); burst(4200, 0.085, 0.2); }
		if (event === 'missile') { burst(1400, 0.55, 0.2); tone(75, 230, 0.35, 0.075, 'triangle'); }
		if (event === 'escort') tone(920, 350, 0.085, 0.045, 'triangle');
		if (event === 'impact') { burst(2200, 0.16, 0.1); tone(220, 75, 0.13, 0.07, 'triangle'); }
		if (event === 'damage') { burst(650, 0.48, 0.27); tone(64, 25, 0.5, 0.25); }
		if (event === 'explosion') { burst(1700, 0.95, 0.36); tone(82, 19, 1.1, 0.3); burst(480, 0.7, 0.12, 0.13); }
		if (event === 'pulse') { tone(90, 720, 0.75, 0.17); tone(180, 1080, 0.9, 0.075); burst(1900, 0.6, 0.1); }
		if (event === 'contact') { tone(523, 523, 0.16, 0.08); tone(392, 392, 0.32, 0.08, 'sine', 0.2); }
		if (event === 'clear' || event === 'repair') { tone(330, 330, 0.3, 0.075); tone(495, 495, 0.5, 0.075, 'sine', 0.18); }
		if (event === 'depart' || event === 'won') {
			for (const [index, midi] of [57, 64, 69, 72, 76].entries()) tone(pitch(midi), pitch(midi), 1.2, 0.08, 'sine', index * 0.16);
		}
		if (event === 'lost') { burst(400, 1.5, 0.22); tone(110, 27.5, 1.9, 0.17); }
		if (event === 'order') { tone(660, 880, 0.075, 0.045); tone(1320, 1320, 0.055, 0.018, 'sine', 0.045); }
	};
	return {
		play,
		unlock: async function (): Promise<boolean> {
			if (disposed || typeof AudioContext === 'undefined') return false;
			let opening: AudioContext | undefined;
			try {
				if (!synth) {
					const context = new AudioContext({ latencyHint: 'interactive' }); opening = context;
					const master = context.createGain(); master.gain.value = 0;
					const music = context.createGain(); music.gain.value = mix.music;
					const musicInput = context.createGain();
					const effects = context.createGain(); effects.gain.value = mix.effects;
					const reverb = context.createConvolver(); const wet = context.createGain(); wet.gain.value = 0.28;
					const compressor = context.createDynamicsCompressor(); compressor.threshold.value = -15; compressor.knee.value = 18; compressor.ratio.value = 4;
					compressor.attack.value = 0.008; compressor.release.value = 0.25;
					musicInput.connect(music); musicInput.connect(reverb); reverb.connect(wet).connect(music);
					music.connect(master); effects.connect(master); master.connect(compressor).connect(context.destination);
					const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
					let seed = 17;
					const random = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
					const samples = noise.getChannelData(0);
					for (let index = 0; index < samples.length; index++) samples[index] = random();
					const impulse = context.createBuffer(2, Math.floor(context.sampleRate * 1.8), context.sampleRate);
					for (let channel = 0; channel < 2; channel++) {
						const data = impulse.getChannelData(channel); let smoothed = 0;
						for (let index = 0; index < data.length; index++) { smoothed = smoothed * 0.55 + random() * 0.45; data[index] = smoothed * (1 - index / data.length) ** 3; }
					}
					reverb.buffer = impulse;
					synth = { context, master, music, musicInput, effects, noise, nodes: [master, music, musicInput, effects, reverb, wet, compressor] };
				}
				const current = synth;
				if (current.context.state === 'suspended') await current.context.resume();
				if (disposed) return false;
				restore(); return current.context.state === 'running';
			} catch {
				if (opening && !synth && opening.state !== 'closed') { try { await opening.close(); } catch { /* Device unavailable. */ } }
				return false;
			}
		},
		setActive: function (value: boolean) {
			if (value === active) { if (value) startClock(); return; }
			active = value; if (value) restore(); else silence();
		},
		setMuted: function (value: boolean) {
			if (value === muted) return;
			muted = value; if (value) silence(); else restore();
		},
		setScene: function (value: AudioScene) {
			if (value === scene) return;
			scene = value; clear('music', 0.18); clear('engine', 0.18);
			beat = 0; nextBeat = synth ? synth.context.currentTime + 0.2 : 0; nextEngine = 0; startClock();
		},
		setMix: function (value: Partial<AudioMix>) {
			mix = { music: normalized(value.music, mix.music), effects: normalized(value.effects, mix.effects) };
			if (!synth) return;
			const now = synth.context.currentTime;
			for (const bus of ['music', 'effects'] as const) { synth[bus].gain.cancelScheduledValues(now); synth[bus].gain.setTargetAtTime(mix[bus], now, 0.03); }
			if (mix.music === 0) clear('music');
			if (mix.effects === 0) { clear('effects'); clear('engine'); }
		},
		getMix: function (): AudioMix { return { ...mix }; },
		reset: function () { silence(); last.clear(); scene = 'fitting'; beat = 0; restore(); },
		dispose: async function () {
			disposed = true; active = false; silence();
			if (synth) {
				for (const node of synth.nodes) node.disconnect();
				if (synth.context.state !== 'closed') { try { await synth.context.close(); } catch { /* Device may already be gone. */ } }
			}
		},
	};
};
