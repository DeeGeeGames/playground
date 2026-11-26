import type { Point } from './simulation';

// Along the lane is screen-right in the isometric camera. Across is screen-down.
const chartPoint = function (along: number, across: number): Point {
	return { x: (along + across) * Math.SQRT1_2, y: (across - along) * Math.SQRT1_2 };
};

export const PASSAGE = {
	origin: chartPoint(-1420, -50),
	fork: chartPoint(-40, -50),
	relay: chartPoint(-340, 465),
	outer: chartPoint(410, 590),
	yard: chartPoint(1120, -50),
	picket: chartPoint(530, -105),
	player: chartPoint(-980, 105),
};

export const RELAY_RANGE = 180;
export const YARD_RANGE = 220;
export const DOCKING_SPEED = 30;
export const TENDER_SPEED = 46;
export type TenderRoute = 'inbound' | 'direct' | 'outer' | 'returning' | 'docked' | 'returned';
export interface PassageView {
	tender: Point & { angle: number };
	route: TenderRoute;
	relayOnline: boolean;
	yardOpen: boolean;
}

export const tenderOrders: Record<TenderRoute, string> = {
	inbound: 'to the fork', direct: 'Sailing direct lane', outer: 'Taking the detour',
	returning: 'Turning back', returned: 'Returned to port', docked: 'At receiving yard',
};
