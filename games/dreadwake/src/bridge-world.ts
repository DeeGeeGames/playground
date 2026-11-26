import ECSpresso from 'ecspresso';
import { advancePassage, type TenderCourse } from './passage';
import type { PassageView } from './passage-layout';
import { step, type Controls, type State } from './simulation';

// The helm samples one order per fixed tick. Each tick resolves combat before
// traffic makes its routing decision, including a kill on the fork arrival tick.
export const createBridgeWorld = async function (initialState: State) {
	const bridge: { battle: State; orders: Controls } = {
		battle: initialState,
		orders: { drive: 0, turn: 0, neutral: false, port: false, starboard: false, brace: false, pulse: false, torpedo: false, autoFire: false },
	};
	const ecs = ECSpresso.create()
		.withResource('bridge', bridge)
		.withComponentTypes<{ passage: PassageView; course: TenderCourse }>()
		.build();
	ecs.addSystem('helm-and-combat').setPriority(10).withResources(['bridge'])
		.setProcess(function ({ resources, dt }) { step(resources.bridge.battle, resources.bridge.orders, dt); });
	ecs.addSystem('passage-traffic').withResources(['bridge'])
		.setProcessEach({ with: ['passage', 'course'], mutates: ['passage', 'course'] }, function ({ entity, resources, dt }) {
			advancePassage(resources.bridge.battle, entity.components.passage, entity.components.course, dt);
		});
	await ecs.initialize();
	let crossing: number | undefined;
	const enter = function (state: State): State {
		if (crossing !== undefined) ecs.removeEntity(crossing);
		bridge.battle = state;
		crossing = state.passage ? ecs.spawn({ passage: state.passage, course: { destination: 'fork' } }).id : undefined;
		return state;
	};
	enter(initialState);
	return {
		enter,
		tick: function (orders: Controls) { bridge.orders = orders; ecs.update(1 / 60); },
		dispose: function () { return ecs.dispose(); },
	};
};
