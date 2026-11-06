import { describe, expect, test } from 'bun:test';
import { createButtonEdges, createCameraInput } from '../src/controller-ui';

describe('controller command edges', function () {
	test('connecting with a held action does not issue it until released and pressed', function () {
		const edges = createButtonEdges();
		expect(edges.read([true, false])).toEqual([]);
		expect(edges.read([true, false])).toEqual([]);
		expect(edges.read([false, false])).toEqual([]);
		expect(edges.read([true, false])).toEqual([0]);
		expect(edges.read([true, false])).toEqual([]);
	});
	test('focus reset suppresses actions held while outside the game', function () {
		const edges = createButtonEdges();
		edges.read([false, false]);
		expect(edges.read([false, true])).toEqual([1]);
		edges.reset();
		expect(edges.read([true, true])).toEqual([]);
		edges.read([false, false]);
		expect(edges.read([true, true])).toEqual([0, 1]);
	});
});

describe('controller camera safety', function () {
	test('held sticks and triggers require neutral on connection and after every modal', function () {
		const input = createCameraInput();
		expect(input.read([0, 0, 1, 0], 0, 1, true)).toEqual({ horizontal: 0, vertical: 0, zoom: 0 });
		input.read([0, 0, 0, 0], 0, 0, true);
		expect(input.read([0, 0, 1, 0], 0, 1, true)).toEqual({ horizontal: 1, vertical: 0, zoom: 1 });
		input.read([0, 0, 1, 0], 0, 1, false);
		expect(input.read([0, 0, 1, 0], 0, 1, true)).toEqual({ horizontal: 0, vertical: 0, zoom: 0 });
		// Opposing held triggers are not a neutral re-arm, even if they cancel.
		input.read([0, 0, 0, 0], 1, 1, true);
		expect(input.read([0, 0, 0, 0], 0, 1, true).zoom).toBe(0);
		input.read([0, 0, 0.04, -0.03], 0.02, 0.01, true);
		expect(input.read([0, 0, 0, 0], 1, 0, true).zoom).toBe(-1);
	});
	test('stick drift and malformed input cannot move the camera or exceed full deflection', function () {
		const input = createCameraInput(); input.read([], 0, 0, true);
		expect(input.read([0, 0, 0.1, -0.1], 0.1, 0.1, true)).toEqual({ horizontal: 0, vertical: 0, zoom: 0 });
		expect(input.read([0, 0, NaN, Infinity], NaN, Infinity, true)).toEqual({ horizontal: 0, vertical: 0, zoom: 0 });
		const diagonal = input.read([0, 0, 5, -5], 0, 5, true);
		expect(Math.hypot(diagonal.horizontal, diagonal.vertical)).toBeCloseTo(1, 8);
		expect(diagonal.zoom).toBe(1);
	});
});
