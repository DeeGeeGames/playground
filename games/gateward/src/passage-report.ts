import type { PassageReport } from './simulation';

const rendered = new WeakMap<HTMLElement, string>();
export const renderPassageReports = function (root: HTMLElement, reports: readonly PassageReport[]) {
	const key = JSON.stringify(reports);
	if (rendered.get(root) === key) return false;
	rendered.set(root, key);
	root.hidden = reports.length === 0;
	root.replaceChildren(...reports.map(function (report) {
		const card = document.createElement('article'); card.className = 'passage-report';
		const title = document.createElement('h3'); title.textContent = `${report.name} · ${report.survived ? 'Survived' : 'Lost'}`;
		const stats = document.createElement('p');
		stats.textContent = `Ark hull ${Math.ceil(report.hullBefore)} → ${Math.ceil(report.hullAfter)} · ${report.kills} hostiles destroyed · ${Math.floor(report.salvageEarned)} combat salvage`;
		const losses = document.createElement('p');
		losses.textContent = report.disabledPlatforms.length > 0
			? `${report.disabledPlatforms.map(function (id) { return `P${id + 1}`; }).join(', ')} disabled · ${report.weaponsLost} weapons lost.${report.recoverySalvage > 0 ? ' Reconsider their formation positions and replace lost guns.' : ''}`
			: 'All platforms remained operational. Weapons retained.';
		card.append(title, stats, losses);
		if (report.recoverySalvage > 0) {
			const recovery = document.createElement('p'); recovery.className = 'recovery';
			recovery.textContent = `Refit supplies: +${report.recoverySalvage} salvage · +${Math.ceil(report.recoveryHull)} ark hull. Ship chassis and equipment restored.`;
			card.append(recovery);
		}
		return card;
	}));
	return true;
};
