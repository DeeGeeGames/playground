import type { Biome, Contract, FactionId, MissionKind, PlanetId } from './campaign-types';

export interface FactionDefinition {
	id: FactionId;
	name: string;
	shortName: string;
	description: string;
	color: string;
}

export interface PlanetDefinition {
	id: PlanetId;
	name: string;
	description: string;
	biome: Biome;
	color: string;
	x: number;
	y: number;
}

const factionDefinitions: Readonly<Record<FactionId, FactionDefinition>> = {
	freeholds: { id: 'freeholds', name: 'Frontier Freeholds', shortName: 'FREEHOLDS', description: 'Independent settlements defending water, farmland, and the right to govern themselves.', color: '#92ceb4' },
	combine: { id: 'combine', name: 'Ferric Combine', shortName: 'COMBINE', description: 'An industrial consortium that treats every mine, transit lane, and garrison as an investment.', color: '#e4ae74' },
	accord: { id: 'accord', name: 'Signal Accord', shortName: 'ACCORD', description: 'A network of orbital stations protecting communication routes and its own expanding influence.', color: '#a8bce8' },
};

const planetDefinitions: Readonly<Record<PlanetId, PlanetDefinition>> = {
	meridian: { id: 'meridian', name: 'Meridian', description: 'Dust plains and abandoned relay yards. Rival settlements contest the last reliable water routes.', biome: 'badlands', color: '#d9ac78', x: 24, y: 62 },
	cinder: { id: 'cinder', name: 'Cinder', description: 'Black volcanic flats beneath a copper sky. Ore processors feed a conflict that never cools.', biome: 'volcanic', color: '#e77b5d', x: 51, y: 27 },
	borealis: { id: 'borealis', name: 'Borealis', description: 'Frozen basins, pale ridges, and listening posts. Whoever holds the uplinks controls the outer settlements.', biome: 'tundra', color: '#9bd6e6', x: 78, y: 58 },
};

export const FACTIONS: readonly FactionDefinition[] = Object.values(factionDefinitions);
export const PLANETS: readonly PlanetDefinition[] = Object.values(planetDefinitions);
export const getFaction = function (id: FactionId): FactionDefinition { return factionDefinitions[id]; };
export const getPlanet = function (id: PlanetId): PlanetDefinition { return planetDefinitions[id]; };

export interface CampaignResult {
	contract: Contract;
	won: boolean;
	aborted: boolean;
	payout: number;
	favor: number;
	day: number;
}

export interface Campaign {
	version: 1;
	seed: number;
	planetId: PlanetId;
	day: number;
	boardRevision: number;
	credits: number;
	completed: number;
	failed: number;
	reputation: Record<FactionId, number>;
	boardReputation: Record<FactionId, number>;
	active: Contract | undefined;
	lastResult: CampaignResult | undefined;
}

const STORAGE_KEY = 'iron-wake:campaign:v1';
const FACTION_IDS: readonly FactionId[] = ['freeholds', 'combine', 'accord'];
const MISSION_KINDS: readonly MissionKind[] = ['defend', 'demolition', 'assassination', 'clearance'];
const MAX_COUNT = 1_000_000;
const MAX_CREDITS = 1_000_000_000_000;
const isInteger = function (value: unknown, min: number, max: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
};
const object = function (value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); };
const isFactionId = function (value: unknown): value is FactionId { return value === 'freeholds' || value === 'combine' || value === 'accord'; };
const isPlanetId = function (value: unknown): value is PlanetId { return value === 'meridian' || value === 'cinder' || value === 'borealis'; };
const isMissionKind = function (value: unknown): value is MissionKind { return value === 'defend' || value === 'demolition' || value === 'assassination' || value === 'clearance'; };
const boundedReputation = function (value: number) { return Math.max(-100, Math.min(100, value)); };
const zeroReputation = function (): Record<FactionId, number> { return { freeholds: 0, combine: 0, accord: 0 }; };
const freshSeed = function () {
	try { return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1; } catch { return Date.now() >>> 0; }
};

export const createCampaign = function (seed?: number): Campaign {
	return {
		version: 1, seed: isInteger(seed, 0, 0xffffffff) ? seed : freshSeed(), planetId: 'meridian', day: 1, boardRevision: 0,
		credits: 0, completed: 0, failed: 0, reputation: zeroReputation(), boardReputation: zeroReputation(), active: undefined, lastResult: undefined,
	};
};

export const reputationLabel = function (score: number): string {
	return score >= 50 ? 'ALLIED' : score >= 20 ? 'TRUSTED' : score >= 5 ? 'FAVORED' : score > -15 ? 'NEUTRAL' : score > -40 ? 'DISTRUSTED' : 'HOSTILE';
};

const mixSeed = function (seed: number, value: number) {
	const mixed = Math.imul(seed ^ value, 0x45d9f3b);
	return (mixed ^ (mixed >>> 16)) >>> 0;
};

const contractCopy: Readonly<Record<MissionKind, { title: string; briefing: string; reward: number }>> = {
	defend: { title: 'Hold the signal', briefing: 'Defend the contracted uplink through the hostile assault. Keep its integrity above zero, then rendezvous with your dropship.', reward: 1200 },
	demolition: { title: 'Break the supply line', briefing: 'Locate and destroy the marked processing facility. Its garrison is expendable; the facility is the objective. Reach extraction after demolition.', reward: 1400 },
	assassination: { title: 'Cut the command link', briefing: 'Find and destroy the designated command frame. Supporting forces are optional targets. Leave the surface through the extraction zone.', reward: 1700 },
	clearance: { title: 'Sweep the basin', briefing: 'Eliminate every hostile patrol across the marked sector. Once the region is clear, return to the extraction zone.', reward: 1600 },
};

// A board is a pure function of its campaign seed and revision. Acceptance keeps
// its reputation snapshot, so posting terms cannot move after the pilot agrees.
export const getContracts = function (campaign: Campaign, planetId: PlanetId = campaign.planetId): Contract[] {
	const planetIndex = PLANETS.findIndex(function (planet) { return planet.id === planetId; });
	const boardSeed = mixSeed(mixSeed(campaign.seed, campaign.boardRevision + 1), planetIndex + 1);
	return MISSION_KINDS.map(function (kind, index) {
		const seed = mixSeed(boardSeed, index + 1);
		const employerIndex = (boardSeed + index) % FACTION_IDS.length;
		const employer = FACTION_IDS[employerIndex] ?? 'freeholds';
		const opponent = FACTION_IDS[(employerIndex + 1 + seed % 2) % FACTION_IDS.length] ?? 'combine';
		const tier = campaign.completed < 2 || index < 2 ? 1 : index === 2 ? 2 : 3;
		const copy = contractCopy[kind];
		const reward = Math.round(copy.reward * (1 + (tier - 1) * 0.55) * (1 + campaign.boardReputation[employer] * 0.0025));
		return {
			id: `${campaign.seed}-${campaign.boardRevision}-${planetId}-${kind}`, seed, planetId, kind, employer, opponent,
			title: copy.title, briefing: copy.briefing, reward, favor: 8 + (tier - 1) * 2, hostility: 6 + (tier - 1) * 2,
			tier, requiredReputation: tier === 1 ? -100 : tier === 2 ? 8 : 20,
		};
	});
};

export const canAcceptContract = function (campaign: Campaign, contract: Contract): boolean {
	return !campaign.active && contract.planetId === campaign.planetId && campaign.reputation[contract.employer] >= contract.requiredReputation
		&& getContracts(campaign).some(function (posted) { return posted.id === contract.id; });
};

export const acceptContract = function (campaign: Campaign, contractId: string): Campaign {
	const contract = getContracts(campaign).find(function (posted) { return posted.id === contractId; });
	if (!contract || !canAcceptContract(campaign, contract)) return campaign;
	return {
		...campaign, active: contract,
		reputation: { ...campaign.reputation, [contract.opponent]: boundedReputation(campaign.reputation[contract.opponent] - contract.hostility) },
	};
};

export const travelTo = function (campaign: Campaign, planetId: PlanetId): Campaign {
	if (campaign.active || campaign.planetId === planetId || campaign.boardRevision >= MAX_COUNT || !isPlanetId(planetId)) return campaign;
	return { ...campaign, planetId, day: campaign.day + 1, boardRevision: campaign.boardRevision + 1, boardReputation: { ...campaign.reputation } };
};

const finishContract = function (campaign: Campaign, won: boolean, aborted: boolean): Campaign {
	const contract = campaign.active;
	if (!contract || campaign.boardRevision >= MAX_COUNT) return campaign;
	const favor = won ? Math.min(contract.favor, 100 - campaign.reputation[contract.employer]) : 0;
	const payout = won ? Math.min(contract.reward, MAX_CREDITS - campaign.credits) : 0;
	const reputation = { ...campaign.reputation, [contract.employer]: boundedReputation(campaign.reputation[contract.employer] + favor) };
	const day = campaign.day + 1;
	return {
		...campaign, active: undefined, reputation, boardReputation: { ...reputation }, day, boardRevision: campaign.boardRevision + 1,
		credits: campaign.credits + payout, completed: campaign.completed + Number(won), failed: campaign.failed + Number(!won),
		lastResult: { contract, won, aborted, payout, favor, day },
	};
};

export const settleContract = function (campaign: Campaign, won: boolean): Campaign { return finishContract(campaign, won, false); };
export const abandonContract = function (campaign: Campaign): Campaign { return finishContract(campaign, false, true); };

const isReputation = function (value: unknown): value is Record<FactionId, number> {
	return object(value) && FACTION_IDS.every(function (id) { return isInteger(value[id], -100, 100); });
};

const isContract = function (value: unknown): value is Contract {
	if (!object(value)) return false;
	return typeof value['id'] === 'string' && value['id'].length <= 100 && isInteger(value['seed'], 0, 0xffffffff)
		&& isPlanetId(value['planetId']) && isMissionKind(value['kind']) && isFactionId(value['employer']) && isFactionId(value['opponent']) && value['employer'] !== value['opponent']
		&& typeof value['title'] === 'string' && value['title'].length <= 100 && typeof value['briefing'] === 'string' && value['briefing'].length <= 500
		&& isInteger(value['reward'], 0, 100_000) && isInteger(value['favor'], 0, 100) && isInteger(value['hostility'], 0, 100)
		&& isInteger(value['tier'], 1, 3) && isInteger(value['requiredReputation'], -100, 100);
};

const isResult = function (value: unknown): value is CampaignResult {
	if (!object(value) || !isContract(value['contract'])) return false;
	const contract = value['contract'];
	return typeof value['won'] === 'boolean' && typeof value['aborted'] === 'boolean' && !(value['won'] && value['aborted'])
		&& isInteger(value['payout'], 0, contract.reward) && isInteger(value['favor'], 0, contract.favor)
		&& (value['won'] || value['payout'] === 0 && value['favor'] === 0) && isInteger(value['day'], 2, MAX_COUNT + 1);
};

const sameContract = function (saved: Contract, generated: Contract): boolean {
	return saved.id === generated.id && saved.seed === generated.seed && saved.planetId === generated.planetId && saved.kind === generated.kind
		&& saved.employer === generated.employer && saved.opponent === generated.opponent && saved.title === generated.title && saved.briefing === generated.briefing
		&& saved.reward === generated.reward && saved.favor === generated.favor && saved.hostility === generated.hostility
		&& saved.tier === generated.tier && saved.requiredReputation === generated.requiredReputation;
};

// Validate the saved transaction, including the already-paid acceptance penalty.
// Invalid saves are reset as a unit; never restore a partly accepted contract.
export const parseCampaign = function (raw: string | null): Campaign {
	if (!raw) return createCampaign();
	try {
		const value: unknown = JSON.parse(raw);
		if (!object(value) || value['version'] !== 1 || !isInteger(value['seed'], 0, 0xffffffff) || !isPlanetId(value['planetId'])
			|| !isInteger(value['day'], 1, MAX_COUNT + 1) || !isInteger(value['boardRevision'], 0, MAX_COUNT) || value['day'] !== value['boardRevision'] + 1
			|| !isInteger(value['credits'], 0, MAX_CREDITS) || !isInteger(value['completed'], 0, MAX_COUNT) || !isInteger(value['failed'], 0, MAX_COUNT)
			|| value['completed'] + value['failed'] > value['boardRevision'] || !isReputation(value['reputation']) || !isReputation(value['boardReputation'])
			|| value['active'] !== undefined && !isContract(value['active']) || value['lastResult'] !== undefined && !isResult(value['lastResult'])) return createCampaign();
		const campaign: Campaign = {
			version: 1, seed: value['seed'], planetId: value['planetId'], day: value['day'], boardRevision: value['boardRevision'],
			credits: value['credits'], completed: value['completed'], failed: value['failed'], reputation: { ...value['reputation'] },
			boardReputation: { ...value['boardReputation'] }, active: value['active'], lastResult: value['lastResult'],
		};
		if (campaign.lastResult && campaign.lastResult.day > campaign.day) return createCampaign();
		if (!FACTION_IDS.every(function (id) {
			const expected = campaign.active?.opponent === id ? boundedReputation(campaign.boardReputation[id] - campaign.active.hostility) : campaign.boardReputation[id];
			return campaign.reputation[id] === expected;
		})) return createCampaign();
		const active = campaign.active;
		if (active) {
			const generated = getContracts(campaign).find(function (contract) { return contract.id === active.id; });
			if (!generated || !sameContract(active, generated) || campaign.reputation[active.employer] < active.requiredReputation) return createCampaign();
			campaign.active = generated;
		}
		return campaign;
	} catch { return createCampaign(); }
};

export const readCampaign = function (): Campaign {
	try { return parseCampaign(localStorage.getItem(STORAGE_KEY)); } catch { return createCampaign(); }
};

export const saveCampaign = function (campaign: Campaign): boolean {
	try { localStorage.setItem(STORAGE_KEY, JSON.stringify(campaign)); return true; } catch { return false; }
};
