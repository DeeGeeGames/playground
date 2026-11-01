import { tactical } from './combat-scale';
import { SMALL_CRAFT_SPEED_SCALE } from './ship-config';

export const CAPITAL_SPEED_SCALE = 0.25;
export const ENEMIES = {
	carrier: { hp: 600, speed: tactical(38) * CAPITAL_SPEED_SCALE, range: tactical(400), damage: 0, reload: 1, reward: 45, armor: 0.7 },
	raider: { hp: 45, speed: tactical(50) * SMALL_CRAFT_SPEED_SCALE, range: tactical(100), damage: 7, reload: 1.2, reward: 9, armor: 1 },
	bomber: { hp: 95, speed: tactical(30) * SMALL_CRAFT_SPEED_SCALE, range: tactical(290), damage: 34, reload: 3.8, reward: 17, armor: 1 },
	armored: { hp: 260, speed: tactical(40) * CAPITAL_SPEED_SCALE, range: tactical(185), damage: 22, reload: 2.4, reward: 28, armor: 0.48 },
	flagship: { hp: 2400, speed: tactical(36) * CAPITAL_SPEED_SCALE, range: tactical(370), damage: 55, reload: 2.8, reward: 180, armor: 0.7 },
};
