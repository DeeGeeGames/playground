import { describe, expect, test } from 'bun:test';
import { createButtonEdges } from '../src/controller-ui';

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
