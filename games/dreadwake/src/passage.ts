import { createArsenal } from './arsenal';
import { DOCKING_SPEED, PASSAGE, RELAY_RANGE, TENDER_SPEED, YARD_RANGE, type PassageView } from './passage-layout';
import { createEmptyState, distance, type Point, type State } from './simulation';
import { createMount } from './weapons';

export interface TenderCourse { destination: 'fork' | 'outer' | 'yard' | 'origin' }

export const createPassage = function (): State {
	const state = createEmptyState();
	const angle = -Math.PI / 4;
	Object.assign(state.player, PASSAGE.player, { angle });
	state.arsenal = createArsenal();
	state.arsenal.mounts[0] = createMount(0, 'rail', 2, angle);
	state.arsenal.mounts[6] = createMount(6, 'flak', 1, angle);
	state.fireControl.automatic = true;
	state.enemies.push({
		...PASSAGE.picket, id: state.nextId++, kind: 'cruiser', holdingStation: true,
		angle: angle + Math.PI, vx: 0, vy: 0, hp: 780, maxHp: 780, length: 170, width: 58,
		weapon: 'missile', cooldown: 1, warning: 0, aim: { ...PASSAGE.player }, orbit: 1,
	});
	state.passage = { tender: { ...PASSAGE.origin, angle }, route: 'inbound', relayOnline: false, yardOpen: false };
	return state;
};

const sailTo = function (ship: PassageView['tender'], target: Point, travel: number): boolean {
	const remaining = distance(ship, target);
	if (remaining === 0) return true;
	ship.angle = Math.atan2(target.y - ship.y, target.x - ship.x);
	const fraction = Math.min(1, travel / remaining);
	ship.x += (target.x - ship.x) * fraction;
	ship.y += (target.y - ship.y) * fraction;
	return fraction === 1;
};

// Resolve the order at the fork using the live picket and relay, then commit
// to that course. Late changes cannot teleport a tender onto another route.
export const advancePassage = function (state: State, passage: PassageView, course: TenderCourse, dt: number) {
	if (state.outcome !== 'playing') return;
	if (passage.yardOpen) {
		if (distance(state.player, PASSAGE.yard) <= YARD_RANGE && Math.hypot(state.player.vx, state.player.vy) <= DOCKING_SPEED) {
			state.player.hp = state.player.maxHp;
			state.outcome = 'won';
		}
		return;
	}
	if (passage.route === 'inbound' || passage.route === 'returning') {
		if (distance(state.player, PASSAGE.relay) <= RELAY_RANGE) passage.relayOnline = true;
		if (passage.route === 'returning' && (passage.relayOnline || state.enemies.length === 0)) {
			passage.route = 'inbound'; course.destination = 'fork';
		}
	}
	if (!sailTo(passage.tender, PASSAGE[course.destination], TENDER_SPEED * dt)) return;
	switch (course.destination) {
		case 'fork':
			if (passage.relayOnline) {
				passage.route = 'outer'; course.destination = 'outer';
			} else if (state.enemies.length === 0) {
				passage.route = 'direct'; course.destination = 'yard';
			} else {
				passage.route = 'returning'; course.destination = 'origin';
			}
			break;
		case 'outer':
			course.destination = 'yard';
			break;
		case 'yard':
			passage.route = 'docked'; passage.yardOpen = true;
			break;
		case 'origin':
			passage.route = 'returned'; state.outcome = 'lost';
			break;
	}
};
