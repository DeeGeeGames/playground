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
		href: './games/gateward/',
		description: 'Build a moving fortress. Fit turrets, launch escort wings, and break through five defensive lines to reach Kepler Gate alive.',
		controls: 'Mouse + Keyboard · Touch',
		category: 'Capital ship tower defense prototype',
	},
	{
		title: 'Dreadwake',
		thumbnail: './games/dreadwake/preview.png',
		thumbnailAlt: 'Dreadwake alpha: an armored star cruiser with split prows, glowing rail arrays, and twin drives in deep space.',
		href: './games/dreadwake/',
		description: 'Command a heavy star cruiser. Coordinate rail broadsides, homing bow torpedoes, and automatic point defense to break a three-contact blockade.',
		controls: 'Keyboard · Touch',
		category: 'Capital starship combat alpha',
	},
	{
		title: 'Iron Wake',
		thumbnail: './games/iron-wake/preview.png',
		thumbnailAlt: 'Iron Wake demo: the Warden siege frame staged in front of Relay 09 in the industrial yard.',
		href: './games/iron-wake/',
		description: 'Pilot an 80-ton siege frame through five assaults. Manage three weapon systems, evade artillery, and refit your frame to keep the last relay transmitting.',
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
