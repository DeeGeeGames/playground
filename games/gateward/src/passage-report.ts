import { REFIT_SUPPORT } from './refit-support';
import { WEAPONS, type PassageReport } from './simulation';

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
		if (report.weaponActivity?.length) {
			const activity = report.weaponActivity;
			const idle = activity.filter(function (gun) { return gun.shots === 0 && gun.beamSeconds === 0; });
			const feedback = document.createElement('p'); feedback.className = 'weapon-feedback';
			feedback.textContent = `${activity.length - idle.length} / ${activity.length} guns engaged.${idle.length ? ` Mounts ${idle.map(function (gun) { return gun.mount + 1; }).join(', ')} never fired. Check their outward arc, range, and formation before the next passage.` : 'Every fitted gun found a firing opportunity.'}`;
			const detail = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Weapon activity'; detail.append(summary);
			for (const gun of activity) {
				const row = document.createElement('p');
				row.textContent = `Mount ${gun.mount + 1} · ${gun.platform === undefined ? 'Ark' : `P${gun.platform + 1}`} · ${WEAPONS[gun.weapon].name}: ${gun.weapon === 'beam' ? `${gun.beamSeconds.toFixed(1)}s firing` : `${gun.shots} shots fired`}`;
				detail.append(row);
			}
			card.append(feedback, detail);
		}
		if (report.recoverySalvage > 0) {
			const recovery = document.createElement('p'); recovery.className = 'recovery';
			recovery.textContent = `Refit supplies: +${report.recoverySalvage} salvage · +${Math.ceil(report.recoveryHull)} ark hull. Ship chassis and equipment restored.`;
			card.append(recovery);
		}
		if (report.support) {
			const support = document.createElement('p'); support.className = 'recovery';
			const receipt = report.support;
			const gains = [receipt.hull > 0 ? `+${Math.ceil(receipt.hull)} hull` : '', receipt.salvage > 0 ? `+${receipt.salvage} salvage` : '', receipt.shield > 0 ? `+${Math.ceil(receipt.shield)} shield` : ''].filter(Boolean).join(' · ');
			support.textContent = `${REFIT_SUPPORT[receipt.id].name}: ${gains}.`;
			card.append(support);
		}
		return card;
	}));
	return true;
};
