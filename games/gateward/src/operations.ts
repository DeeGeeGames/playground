import type { EnemyKind } from './simulation';

export interface Passage {
	readonly name: string;
	readonly scout: string;
	readonly threats: readonly { readonly kind: EnemyKind; readonly x: number; readonly y: number }[];
}

export const KEPLER_PASSAGES = [
	{ name: 'Port battery', scout: 'Armor and fighters form ahead along the route. Cover the bow on approach and port as they fall alongside.', threats: [{ kind: 'armored', x: 900, y: -360 }, { kind: 'raider', x: 1100, y: -180 }, { kind: 'raider', x: 1100, y: 180 }, { kind: 'raider', x: 1300, y: 0 }] },
	{ name: 'Crossfire', scout: 'Two armored ships approach on starboard; three bombers attack from port. Protect both flanks and fit forward ships to meet the approach.', threats: [{ kind: 'armored', x: 900, y: 360 }, { kind: 'armored', x: 1150, y: 420 }, { kind: 'bomber', x: 1000, y: -260 }, { kind: 'bomber', x: 1300, y: -340 }, { kind: 'bomber', x: 850, y: -420 }] },
	{ name: 'Gate approach', scout: 'A flagship and armored escort screen four bombers and two fighters. Bombardment threatens both flanks. Spread your coverage, replace lost guns and survive the final approach.', threats: [{ kind: 'flagship', x: 1400, y: -420 }, { kind: 'raider', x: 950, y: 180 }, { kind: 'raider', x: 1150, y: -180 }, { kind: 'bomber', x: 1300, y: 340 }, { kind: 'bomber', x: 1050, y: -300 }, { kind: 'armored', x: 1100, y: 420 }, { kind: 'bomber', x: 900, y: 260 }, { kind: 'bomber', x: 1200, y: -180 }] },
] as const;

const PICKET: Passage = {
	name: 'Picket screen', scout: 'Six light fighters approach in a broad screen. Rapid-fire and overlapping forward coverage can thin their numbers before they surround the ark.',
	threats: [{ kind: 'raider', x: 850, y: -360 }, { kind: 'raider', x: 850, y: 360 }, { kind: 'raider', x: 1050, y: -180 }, { kind: 'raider', x: 1050, y: 180 }, { kind: 'raider', x: 1250, y: -300 }, { kind: 'raider', x: 1250, y: 300 }],
};
const HAMMER: Passage = {
	name: 'Starboard hammer', scout: 'Three armored ships hold a staggered starboard approach with two port fighters. Armor-piercing fire and starboard coverage matter here.',
	threats: [{ kind: 'armored', x: 850, y: 280 }, { kind: 'armored', x: 1100, y: 420 }, { kind: 'armored', x: 1400, y: 200 }, { kind: 'raider', x: 950, y: -280 }, { kind: 'raider', x: 1150, y: -400 }],
};
const NEEDLE: Passage = {
	name: 'Needle corridor', scout: 'Four bombers form two narrow attack lanes, supported by four fighters. Cover both flanks; clustered targets reward splash damage.',
	threats: [{ kind: 'bomber', x: 900, y: -300 }, { kind: 'bomber', x: 1050, y: -360 }, { kind: 'bomber', x: 900, y: 300 }, { kind: 'bomber', x: 1050, y: 360 }, { kind: 'raider', x: 1250, y: -180 }, { kind: 'raider', x: 1300, y: -240 }, { kind: 'raider', x: 1250, y: 180 }, { kind: 'raider', x: 1300, y: 240 }],
};
const BREAKWATER: Passage = {
	name: 'Breakwater', scout: 'Four armored ships form paired columns on both flanks. Two bombers follow the port column. Split anti-armor coverage and protect exposed platforms.',
	threats: [{ kind: 'armored', x: 850, y: -280 }, { kind: 'armored', x: 1200, y: -420 }, { kind: 'armored', x: 850, y: 280 }, { kind: 'armored', x: 1200, y: 420 }, { kind: 'bomber', x: 1400, y: -180 }, { kind: 'bomber', x: 1550, y: -340 }],
};
const WAKE_GATE: Passage = {
	name: 'Wake gate', scout: 'A starboard flagship and two port armored escorts guard the exit. Four bombers attack from both flanks. Use your accumulated salvage to rebuild and cover the entire approach.',
	threats: [{ kind: 'flagship', x: 1450, y: 400 }, { kind: 'armored', x: 900, y: -350 }, { kind: 'armored', x: 1200, y: -420 }, { kind: 'bomber', x: 1000, y: -180 }, { kind: 'bomber', x: 1300, y: -260 }, { kind: 'bomber', x: 1000, y: 180 }, { kind: 'bomber', x: 1300, y: 300 }],
};
const IRON_PICKET: Passage = {
	name: 'Iron picket', scout: 'One armored ship on each flank screens four fighters. Build for mixed threats immediately; this crossing offers no quiet opening.',
	threats: [{ kind: 'armored', x: 950, y: -350 }, { kind: 'armored', x: 1150, y: 350 }, { kind: 'raider', x: 850, y: -180 }, { kind: 'raider', x: 850, y: 180 }, { kind: 'raider', x: 1250, y: -280 }, { kind: 'raider', x: 1250, y: 280 }],
};
const PORT_SIEGE: Passage = {
	name: 'Port siege', scout: 'Three bombers and two armored ships concentrate on port. Two starboard fighters punish an entirely one-sided build. Shift your platforms toward the main attack.',
	threats: [{ kind: 'armored', x: 900, y: -400 }, { kind: 'armored', x: 1250, y: -300 }, { kind: 'bomber', x: 850, y: -180 }, { kind: 'bomber', x: 1100, y: -240 }, { kind: 'bomber', x: 1400, y: -420 }, { kind: 'raider', x: 950, y: 250 }, { kind: 'raider', x: 1150, y: 350 }],
};
const IRON_GATE: Passage = {
	name: 'Iron gate', scout: 'Two flagships anchor opposing flanks while four bombers attack down the center. You only need to reach the exit. Cover both sides and preserve the ark through the final bombardment.',
	threats: [{ kind: 'flagship', x: 1450, y: -420 }, { kind: 'flagship', x: 1700, y: 420 }, { kind: 'bomber', x: 950, y: -180 }, { kind: 'bomber', x: 1150, y: 180 }, { kind: 'bomber', x: 1350, y: -280 }, { kind: 'bomber', x: 1500, y: 280 }],
};

export const OPERATION_IDS = ['kepler', 'long-wake', 'iron-crossing'] as const;
export type OperationId = typeof OPERATION_IDS[number];
export interface Operation {
	readonly name: string;
	readonly description: string;
	readonly difficulty: string;
	readonly destination: string;
	readonly passages: readonly Passage[];
}
export const OPERATIONS = {
	kepler: { name: 'Kepler', description: 'A short crossing to learn fitting, formation and refitting.', difficulty: 'Standard', destination: 'Kepler Gate', passages: KEPLER_PASSAGES },
	'long-wake': { name: 'Long Wake', description: 'Five defensive lines alternate fighter screens, armor and bomber corridors. Grow your convoy between passages.', difficulty: 'Extended', destination: 'Wake Gate', passages: [PICKET, HAMMER, NEEDLE, BREAKWATER, WAKE_GATE] },
	'iron-crossing': { name: 'Iron Crossing', description: 'Six mixed defensive lines demand sustained fleet investment and coverage on both flanks.', difficulty: 'Veteran', destination: 'Iron Gate', passages: [IRON_PICKET, PORT_SIEGE, HAMMER, BREAKWATER, NEEDLE, IRON_GATE] },
} satisfies Record<OperationId, Operation>;
