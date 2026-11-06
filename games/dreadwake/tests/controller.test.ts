import { expect, test } from 'bun:test';
import { createController, type PadSample } from '../src/controller';

const sample = function (pressed: readonly number[] = [], axes: readonly number[] = [0, 0, 0, 0]): PadSample {
	return { index: 0, axes, buttons: Array.from({ length: 16 }, function (_, index) { return { pressed: pressed.includes(index), value: pressed.includes(index) ? 1 : 0 }; }) };
};

test('held controls cannot leak through launch, menus, or controller reconnect', function () {
	const controller = createController();
	expect(controller.read(sample([7, 0]), 0).starboard).toBe(false);
	controller.read(sample(), 10);
	expect(controller.read(sample([7, 0]), 20).starboard).toBe(true);
	controller.clear();
	expect(controller.read(sample([7, 0]), 30).confirm).toBe(false);
	controller.read(sample(), 40);
	expect(controller.read(sample([0]), 50).confirm).toBe(true);
	controller.read(undefined, 60);
	expect(controller.read(sample([0, 7]), 70).starboard).toBe(false);
});

test('missiles and shields are edge triggered while beams and arrays can be held', function () {
	const controller = createController(); controller.read(sample(), 0);
	const first = controller.read(sample([0, 2, 5, 6]), 10);
	expect([first.pulse, first.missile, first.beam, first.port]).toEqual([true, true, true, true]);
	const held = controller.read(sample([0, 2, 5, 6]), 30);
	expect([held.pulse, held.missile, held.beam, held.port]).toEqual([false, false, true, true]);
});

test('stick drift is ignored and menu repeat waits before advancing again', function () {
	const controller = createController(); controller.read(sample([], [0.12, -0.12, 0, 0]), 0);
	expect(controller.read(sample([], [0.12, -0.12, 0, 0]), 10).used).toBe(false);
	expect(controller.read(sample([13]), 20).direction).toBe('down');
	expect(controller.read(sample([13]), 100).direction).toBeUndefined();
	expect(controller.read(sample([13]), 410).direction).toBe('down');
	expect(controller.read(sample([13]), 440).direction).toBeUndefined();
});
