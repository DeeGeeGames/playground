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
		description: 'An 80-ton mech. Three weapon systems. Hold the relay against an armored assault with cannons, lasers, and homing missiles.',
		controls: 'Keyboard + Mouse · Touch',
		category: 'Mech defense prototype',
	},
	{
		title: 'Power Up',
		href: './games/power-up/',
		description: 'A small platform. A growing swarm. Experiment with melee combos, airborne movement, and homing shots.',
		controls: 'Keyboard · Gamepad · Touch',
		category: 'Action sandbox',
	},
];
