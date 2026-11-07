export interface Experiment {
	readonly title: string;
	readonly href: string;
	readonly description: string;
	readonly controls: string;
	readonly category: string;
	readonly thumbnail?: string;
	readonly thumbnailAlt?: string;
}

// Add a game folder, then add its link here. Tooling discovers pages itself.
export const experiments: readonly Experiment[] = [
	{
		title: 'Gateward',
		thumbnail: './games/gateward/preview.png',
		thumbnailAlt: 'Gateward convoy crossing a defensive line beneath a distant planet, with the ark and its fitted frigates.',
		href: 'https://gateward.deegeegames.com/',
		description: 'Build and refit a moving fortress. Choose an operation, fit your convoy, and adapt between defensive lines to bring the ark home.',
		controls: 'Mouse + Keyboard · Touch · Controller',
		category: 'Convoy defense demo',
	},
	{
		title: 'Dread Wake',
		thumbnail: './games/dreadwake/preview.png',
		thumbnailAlt: 'Dread Wake demo: an armored capital cruiser with paired drives and rail arrays in the Lyra Passage.',
		href: './games/dreadwake/',
		description: 'Command a heavy cruiser through five linked encounters. Coordinate broadsides, beams, torpedoes and guided missiles, then refit your damaged ship.',
		controls: 'Keyboard + Mouse · Gamepad · Touch',
		category: 'Capital starship combat demo',
	},
	{
		title: 'Heavy Rig',
		thumbnail: './games/iron-wake/preview.png',
		thumbnailAlt: 'Heavy Rig demo: the Warden siege frame staged in front of Relay 09 in the industrial yard.',
		href: 'https://heavyrig.deegeegames.com/',
		description: 'Command a mercenary dropship across three worlds. Choose faction contracts, build your reputation, and deploy five combat frames into varied surface missions.',
		controls: 'Keyboard + Mouse · Gamepad · Touch',
		category: 'Isometric mech combat demo',
	},
	{
		title: 'Power Up',
		thumbnail: './images/power-up.webp',
		thumbnailAlt: 'Power Up gameplay: a cyan fighter facing a swarm above a floating platform.',
		href: './games/power-up/',
		description: 'A small platform. A growing swarm. Experiment with melee combos, airborne movement, and homing shots.',
		controls: 'Keyboard · Gamepad · Touch',
		category: 'Action sandbox',
	},
];
