import type { CombatEvent } from './simulation';

export interface AudioFrame {
	speed: number;
	laser: boolean;
	heat: number;
	active: boolean;
}

interface Voice {
	source: AudioScheduledSourceNode;
	gain: GainNode;
	filter: BiquadFilterNode | undefined;
}

interface Synth {
	context: AudioContext;
	master: GainNode;
	engine: OscillatorNode;
	engineFilter: BiquadFilterNode;
	engineGain: GainNode;
	laser: OscillatorNode;
	laserGain: GainNode;
	noise: AudioBuffer;
}

const clamp = function (value: number, low: number, high: number) {
	return Math.max(low, Math.min(high, value));
};

// All sounds are synthesized locally. Nothing loads or plays before a gesture.
export const createAudio = function () {
	let synth: Synth | undefined;
	let disposed = false;
	let muted = false;
	let active = false;
	let nextStep = 0;
	const voices = new Set<Voice>();
	const lastEvent = new Map<CombatEvent, number>();

	const finish = function (voice: Voice) {
		voice.source.onended = null;
		voice.source.disconnect();
		voice.gain.disconnect();
		voice.filter?.disconnect();
		voices.delete(voice);
	};
	const stopVoice = function (voice: Voice) {
		try { voice.source.stop(); } catch { /* The scheduled source may already have ended. */ }
		finish(voice);
	};
	const clearVoices = function () {
		for (const voice of voices) stopVoice(voice);
	};
	const register = function (voice: Voice, at: number, duration: number) {
		// Bound concurrent sources even when many impacts land in one frame.
		if (voices.size >= 24) {
			const oldest = voices.values().next().value;
			if (oldest) stopVoice(oldest);
		}
		voices.add(voice);
		voice.source.onended = function () { finish(voice); };
		voice.source.start(at);
		voice.source.stop(at + duration);
	};

	const tone = function (frequency: number, endFrequency: number, duration: number, volume: number, type: OscillatorType = 'sine', delay = 0) {
		if (!synth) return;
		const { context, master } = synth;
		const at = context.currentTime + delay;
		const source = context.createOscillator();
		const gain = context.createGain();
		source.type = type;
		source.frequency.setValueAtTime(frequency, at);
		source.frequency.exponentialRampToValueAtTime(Math.max(15, endFrequency), at + duration);
		gain.gain.setValueAtTime(0, at);
		gain.gain.linearRampToValueAtTime(volume, at + 0.008);
		gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
		source.connect(gain).connect(master);
		register({ source, gain, filter: undefined }, at, duration + 0.02);
	};
	const noise = function (duration: number, volume: number, frequency: number, type: BiquadFilterType = 'lowpass') {
		if (!synth) return;
		const { context, master } = synth;
		const at = context.currentTime;
		const source = context.createBufferSource();
		const filter = context.createBiquadFilter();
		const gain = context.createGain();
		source.buffer = synth.noise;
		filter.type = type;
		filter.frequency.setValueAtTime(frequency, at);
		filter.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 0.25), at + duration);
		filter.Q.value = 0.7;
		gain.gain.setValueAtTime(0, at);
		gain.gain.linearRampToValueAtTime(volume, at + 0.006);
		gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
		source.connect(filter).connect(gain).connect(master);
		register({ source, gain, filter }, at, duration + 0.02);
	};

	const unlock = async function (): Promise<boolean> {
		if (disposed || typeof globalThis.AudioContext !== 'function') return false;
		let opening: AudioContext | undefined;
		try {
			if (!synth) {
				const context = new AudioContext({ latencyHint: 'interactive' });
				opening = context;
				const master = context.createGain();
				master.gain.value = 0;
				master.connect(context.destination);
				const engine = context.createOscillator();
				const engineFilter = context.createBiquadFilter();
				const engineGain = context.createGain();
				engine.type = 'sawtooth';
				engine.frequency.value = 38;
				engineFilter.type = 'lowpass';
				engineFilter.frequency.value = 105;
				engineGain.gain.value = 0;
				engine.connect(engineFilter).connect(engineGain).connect(master);
				const laser = context.createOscillator();
				const laserGain = context.createGain();
				laser.type = 'triangle';
				laser.frequency.value = 420;
				laserGain.gain.value = 0;
				laser.connect(laserGain).connect(master);
				const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
				const samples = buffer.getChannelData(0);
				for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
				synth = { context, master, engine, engineFilter, engineGain, laser, laserGain, noise: buffer };
				engine.start();
				laser.start();
			}
			const current = synth;
			await current.context.resume();
			return !disposed && current.context.state === 'running';
		} catch {
			if (opening && !synth && opening.state !== 'closed') {
				try { await opening.close(); } catch { /* An unavailable device can reject context cleanup. */ }
			}
			return false;
		}
	};

	const setMuted = function (value: boolean) {
		muted = value;
		if (!synth) return;
		if (muted) clearVoices();
		const at = synth.context.currentTime;
		synth.master.gain.cancelScheduledValues(at);
		synth.master.gain.setTargetAtTime(active && !muted ? 0.28 : 0, at, 0.008);
	};

	const update = function (frame: AudioFrame) {
		active = frame.active;
		if (!synth || disposed) return;
		const { context, master, engine, engineFilter, engineGain, laser, laserGain } = synth;
		const at = context.currentTime;
		const audible = active && !muted && context.state === 'running';
		const speed = clamp(Math.abs(frame.speed) / 90, 0, 1);
		master.gain.setTargetAtTime(audible ? 0.28 : 0, at, 0.015);
		engine.frequency.setTargetAtTime(35 + speed * 29, at, 0.1);
		engineFilter.frequency.setTargetAtTime(90 + speed * 80, at, 0.1);
		engineGain.gain.setTargetAtTime(audible ? 0.035 + speed * 0.045 : 0, at, 0.08);
		laser.frequency.setTargetAtTime(360 + clamp(frame.heat, 0, 100) * 2.6, at, 0.03);
		laserGain.gain.setTargetAtTime(audible && frame.laser ? 0.055 : 0, at, 0.02);
		if (!audible) {
			clearVoices();
			nextStep = at;
			return;
		}
		if (speed > 0.08 && at >= nextStep) {
			tone(66, 28, 0.15, 0.1 + speed * 0.1);
			noise(0.12, 0.11, 400);
			nextStep = at + 0.65 - speed * 0.24;
		}
	};

	const play = function (events: readonly CombatEvent[]) {
		if (!synth || disposed || muted || !active || synth.context.state !== 'running') return;
		const at = synth.context.currentTime;
		for (const event of events.slice(0, 12)) {
			const previous = lastEvent.get(event) ?? -10;
			const interval = event === 'impact' ? 0.06 : event === 'explosion' ? 0.08 : 0.025;
			if (at - previous < interval) continue;
			lastEvent.set(event, at);
			switch (event) {
				case 'cannon':
					tone(125, 26, 0.33, 0.5, 'triangle');
					noise(0.28, 0.7, 1700);
					break;
				case 'missile':
					noise(0.5, 0.4, 2100, 'bandpass');
					tone(150, 380, 0.24, 0.12, 'sawtooth');
					break;
				case 'impact':
					noise(0.11, 0.25, 2400, 'bandpass');
					tone(470, 120, 0.1, 0.12, 'triangle');
					break;
				case 'explosion':
					noise(0.65, 0.7, 1000);
					tone(90, 19, 0.55, 0.45);
					break;
				case 'coolant':
					noise(0.8, 0.3, 3400, 'highpass');
					tone(760, 330, 0.4, 0.08);
					break;
				case 'pickup':
					tone(520, 620, 0.1, 0.15);
					tone(780, 930, 0.18, 0.13, 'sine', 0.1);
					break;
				case 'overheat':
					tone(210, 180, 0.18, 0.16, 'triangle');
					tone(210, 180, 0.18, 0.16, 'triangle', 0.25);
					break;
				case 'wave':
					tone(330, 330, 0.16, 0.12);
					tone(440, 440, 0.22, 0.12, 'sine', 0.18);
					break;
				case 'victory':
					tone(330, 330, 0.22, 0.13);
					tone(440, 440, 0.22, 0.13, 'sine', 0.18);
					tone(660, 660, 0.5, 0.13, 'sine', 0.36);
					break;
				case 'defeat':
					tone(220, 180, 0.35, 0.14, 'triangle');
					tone(150, 75, 0.65, 0.16, 'triangle', 0.25);
					break;
			}
		}
	};

	const dispose = async function () {
		if (disposed) return;
		disposed = true;
		active = false;
		clearVoices();
		if (!synth) return;
		const current = synth;
		synth = undefined;
		current.engine.stop();
		current.laser.stop();
		current.engine.disconnect();
		current.engineFilter.disconnect();
		current.engineGain.disconnect();
		current.laser.disconnect();
		current.laserGain.disconnect();
		current.master.disconnect();
		if (current.context.state !== 'closed') await current.context.close();
	};

	return { unlock, setMuted, update, play, dispose };
};
