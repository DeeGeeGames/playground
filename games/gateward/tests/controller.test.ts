import { describe, expect, test } from 'bun:test';
import { createButtonEdges } from '../src/controller';

describe('controller button lifecycle', function () {
	test('connection primes held buttons and a hold cannot repeat an order', function () {
		const edges = createButtonEdges();
		expect(edges('controller', [true])).toEqual([]);
		expect(edges('controller', [true])).toEqual([]);
		expect(edges('controller', [false])).toEqual([]);
		expect(edges('controller', [true])).toEqual([0]);
		expect(edges('controller', [true])).toEqual([]);
	});
	test('focus reset and replacement controller require release before another order', function () {
		const edges = createButtonEdges();
		edges('first', [false]);
		expect(edges('first', [true])).toEqual([0]);
		edges(undefined, []);
		expect(edges('first', [true])).toEqual([]);
		expect(edges('second', [true])).toEqual([]);
		edges('second', [false]);
		expect(edges('second', [true])).toEqual([0]);
	});
	test('independent buttons preserve rising edges without repeating held inputs', function () {
		const edges = createButtonEdges();
		edges('controller', [false, false, false]);
		expect(edges('controller', [false, true, false])).toEqual([1]);
		expect(edges('controller', [true, true, true])).toEqual([0, 2]);
		expect(edges('controller', [true, true, true])).toEqual([]);
	});
});
