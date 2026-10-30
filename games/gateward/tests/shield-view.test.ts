import { expect, test } from 'bun:test';
import { createState, pulse } from '../src/simulation';
import { shieldAppearance } from '../src/shield-view';

test('persistent shield and emergency Aegis have independent presentation', function () {
	const state = createState({ systems: true });
	expect(shieldAppearance(state)).toMatchObject({ energyVisible: true, aegisVisible: false, energyColor: '#75bfe8' });
	const shield = state.systems?.shield; if (!shield) throw new Error('Missing energy shield');
	shield.charge = 0; shield.hitFlash = 0.45;
	expect(shieldAppearance(state)).toMatchObject({ energyVisible: true, energyColor: '#efad79' });
	shield.hitFlash = 0; expect(shieldAppearance(state).energyVisible).toBe(false);
	state.status = 'running'; pulse(state);
	expect(shieldAppearance(state)).toMatchObject({ energyVisible: false, aegisVisible: true });
	expect(shield.charge).toBe(0);
});

test('legacy presentation has only the pulse bubble and deriving visuals never mutates state', function () {
	const state = createState(); state.status = 'running'; pulse(state);
	const before = JSON.stringify(state);
	expect(shieldAppearance(state)).toMatchObject({ energyVisible: false, aegisVisible: true });
	expect(JSON.stringify(state)).toBe(before);
});
