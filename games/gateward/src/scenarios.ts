import type { EnemyKind } from './simulation';

// The single Systems Trial encounter composition. Route progress deploys each
// group at a spawn point; raiders travel aboard finite-complement carriers.
export const ENCOUNTERS: readonly { readonly kind: EnemyKind; readonly count: number }[] = [
	{ kind: 'raider', count: 8 },
	{ kind: 'bomber', count: 6 },
	{ kind: 'armored', count: 3 },
	{ kind: 'raider', count: 10 },
	{ kind: 'bomber', count: 3 },
];
