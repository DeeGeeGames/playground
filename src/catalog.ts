export interface Experiment {
	readonly title: string;
	readonly href: string;
	readonly description: string;
	readonly controls: string;
	readonly category: string;
}

// Add a game folder, then add its link here. Tooling discovers pages itself.
export const experiments: readonly Experiment[] = [
	{
		title: 'Iron Wake',
		href: './games/iron-wake/',
		description: 'An isometric siege frame, persistent throttle, and three weapon systems. Manage heat, recover salvage, and hold the relay against three assault waves.',
		controls: 'Keyboard + Mouse · Touch',
		category: 'Isometric mech defense',
	},
	{
		title: 'Power Up',
		href: './games/power-up/',
		description: 'A small platform. A growing swarm. Experiment with melee combos, airborne movement, and homing shots.',
		controls: 'Keyboard · Gamepad · Touch',
		category: 'Action sandbox',
	},
];
