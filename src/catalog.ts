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
		title: 'Dreadwake',
		thumbnail: './games/dreadwake/preview.png',
		thumbnailAlt: 'Dreadwake prototype: an isometric capital ship firing both six-gun broadside batteries.',
		href: './games/dreadwake/',
		description: 'Command a lumbering capital ship. Carry momentum through slow turns, line up six-gun broadsides, and brace against incoming volleys.',
		controls: 'Keyboard · Touch',
		category: 'Isometric capital combat prototype',
	},
	{
		title: 'Iron Wake',
		thumbnail: './images/iron-wake.webp',
		thumbnailAlt: 'Iron Wake gameplay: an armored mech defending a relay on an isometric battlefield.',
		href: './games/iron-wake/',
		description: 'An isometric siege frame, persistent throttle, and three weapon systems. Manage heat, recover salvage, and hold the relay against three assault waves.',
		controls: 'Keyboard + Mouse · Touch',
		category: 'Isometric mech defense',
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
