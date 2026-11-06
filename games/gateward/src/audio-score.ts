export type AudioScene = 'fitting' | 'transit' | 'tension' | 'victory' | 'defeat';

interface Score {
	readonly tempo: number;
	readonly chords: readonly (readonly number[])[];
	readonly melody: readonly (number | null)[];
	readonly pulse: boolean;
	readonly color: number;
}

// An original eight-bar theme: open fifths at the dock, a moving minor arpeggio
// underway, then a suspended cadence for arrival. Numbers are MIDI pitches.
const HOME = [[45, 52, 60, 64], [41, 48, 57, 60], [48, 55, 60, 64], [43, 50, 59, 62]] as const;
const DANGER = [[45, 52, 59, 60], [41, 48, 55, 59], [43, 50, 57, 60], [40, 47, 55, 59]] as const;
const ARRIVAL = [[48, 55, 60, 64], [43, 50, 59, 62], [45, 52, 60, 64], [41, 48, 57, 64]] as const;
export const SCORES: Record<AudioScene, Score> = {
	fitting: { tempo: 64, chords: HOME, melody: [76, null, null, null, 72, null, 71, null, 69, null, null, null, 64, null, 67, null], pulse: false, color: 820 },
	transit: { tempo: 88, chords: HOME, melody: [69, null, 76, null, 72, null, 71, null, 64, null, 67, 69, null, 72, 71, null], pulse: true, color: 1400 },
	tension: { tempo: 104, chords: DANGER, melody: [69, null, 71, 72, null, 76, 72, null, 71, null, 67, null, 64, null, 67, 71], pulse: true, color: 1900 },
	victory: { tempo: 68, chords: ARRIVAL, melody: [76, null, null, 79, null, null, 76, null, 72, null, null, null, 74, null, 76, null], pulse: false, color: 1300 },
	defeat: { tempo: 52, chords: [[45, 52, 59], [41, 48, 55], [40, 47, 55], [45, 52, 57]], melody: [69, null, null, null, 67, null, null, null, 64, null, null, null, 59, null, null, null], pulse: false, color: 520 },
};

export const pitch = function (note: number): number { return 440 * 2 ** ((note - 69) / 12); };
