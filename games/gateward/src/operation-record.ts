import type { OperationId } from './operations';

const key = function (id: OperationId) { return `gateward.operation.v1.${id}`; };
const read = function (id: OperationId): { wins: number; hull: number } {
	try {
		const raw: unknown = JSON.parse(localStorage.getItem(key(id)) ?? 'null');
		if (typeof raw === 'object' && raw !== null && 'wins' in raw && 'hull' in raw
			&& typeof raw.wins === 'number' && Number.isSafeInteger(raw.wins) && raw.wins > 0
			&& typeof raw.hull === 'number' && Number.isFinite(raw.hull) && raw.hull > 0 && raw.hull <= 1200) {
			return { wins: raw.wins, hull: raw.hull };
		}
	} catch { /* Storage restrictions must not prevent playing. */ }
	return { wins: 0, hull: 0 };
};
export const operationRecord = function (id: OperationId): string {
	const record = read(id);
	return record.wins > 0 ? `${record.wins} successful convoys · best arrival ${Math.ceil(record.hull)} / 1200 hull · saved on this device` : 'No successful convoy recorded on this device.';
};
export const recordOperation = function (id: OperationId, hull: number) {
	if (!Number.isFinite(hull) || hull <= 0 || hull > 1200) return;
	const record = read(id);
	try { localStorage.setItem(key(id), JSON.stringify({ wins: Math.min(Number.MAX_SAFE_INTEGER, record.wins + 1), hull: Math.max(record.hull, hull) })); }
	catch { /* Completion remains valid if local storage is unavailable. */ }
};
