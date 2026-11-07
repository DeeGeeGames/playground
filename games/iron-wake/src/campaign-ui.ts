import { html, render } from 'lit-html';
import { canAcceptContract, FACTIONS, getContracts, getFaction, getPlanet, PLANETS, reputationLabel, travelTo, type Campaign } from './campaign';
import type { Contract, MissionKind, PlanetId } from './campaign-types';

export const MISSION_NAMES: Readonly<Record<MissionKind, string>> = {
	defend: 'Garrison defense', demolition: 'Facility demolition', assassination: 'Priority target', clearance: 'Area clearance',
};
const OBJECTIVES: Readonly<Record<MissionKind, string>> = {
	defend: 'Hold the relay against the assault. Keep its integrity above zero, then return to extraction.',
	demolition: 'Find and destroy the marked installation. Its garrison is optional; extraction is required.',
	assassination: 'Track down the marked command frame. Destroy it and reach extraction alive.',
	clearance: 'Sweep the marked sectors and eliminate every hostile. Extract once the area is clear.',
};
const signed = function (value: number) { return `${value > 0 ? '+' : ''}${value}`; };

export interface BridgeActions {
	selectPlanet: (planetId: PlanetId) => void;
	selectContract: (id: string) => void;
	travel: () => void;
	accept: (contract: Contract) => void;
	deploy: () => void;
	abandon: () => void;
	training: () => void;
	legacy: () => void;
	settings: () => void;
	handbook: () => void;
}

export const renderBridge = function (root: HTMLElement, campaign: Campaign, destination: PlanetId, selection: string | undefined, saved: boolean, actions: BridgeActions) {
	const planet = getPlanet(destination);
	const current = getPlanet(campaign.planetId);
	const contracts = getContracts(destination === campaign.planetId ? campaign : travelTo(campaign, destination), destination);
	const selected = campaign.active ?? contracts.find(function (contract) { return contract.id === selection; }) ?? contracts.find(function (contract) { return canAcceptContract(campaign, contract); }) ?? contracts[0];
	const local = destination === campaign.planetId;
	const active = campaign.active;
	render(html`
		<header class="bridge-header">
			<div class="bridge-brand"><span class="insignia" aria-hidden="true">IW</span><div><span class="eyebrow">IRON WAKE / FRONTIER COMPANY</span><h1>WAYFARER<span>COMMAND BRIDGE</span></h1></div></div>
			<div class="career-stats"><div><small>IN ORBIT</small><b>${current.name}</b></div><div><small>CAREER EARNINGS</small><b>${campaign.credits.toLocaleString()} <em>CR</em></b></div><div><small>CONTRACTS CLEARED</small><b>${String(campaign.completed).padStart(2, '0')}</b></div></div>
		</header>
		<div class="bridge-layout">
			<section class="navigation-panel" aria-labelledby="navigation-title">
				<div class="bridge-section-title"><span class="eyebrow">01 / NAVIGATION</span><span>DAY ${String(campaign.day).padStart(2, '0')}</span></div>
				<h2 id="navigation-title">THE FRONTIER.</h2>
				<p class="bridge-description">Three worlds. Competing loyalties. Your company chooses its next contract.</p>
				<div class="star-map" aria-label="Frontier destinations">
					<svg class="star-lanes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M 24 62 L 51 27 L 78 58 Z"/></svg>
					${PLANETS.map(function (world) { return html`<button class="planet-node ${world.id === campaign.planetId ? 'in-orbit' : ''}" style="left:${world.x}%;top:${world.y}%;--planet-color:${world.color}" aria-pressed=${world.id === destination} @click=${function () { actions.selectPlanet(world.id); }} ?disabled=${Boolean(active)} data-planet=${world.id}><span class="planet-orb" aria-hidden="true"></span><b>${world.name}</b><small>${world.id === campaign.planetId ? 'WAYFARER IN ORBIT' : world.biome.toUpperCase()}</small></button>`; })}
				</div>
				<div class="course-details"><span class="eyebrow">${local ? 'CURRENT ORBIT' : 'PLOTTED DESTINATION'}</span><h3>${planet.name}</h3><p>${planet.description}</p><button id="bridge-travel" class="secondary" ?disabled=${local || Boolean(active)} @click=${actions.travel}>${local ? 'ORBIT ESTABLISHED' : active ? 'FINISH ACTIVE CONTRACT TO TRAVEL' : `JUMP TO ${planet.name.toUpperCase()} →`}</button><small>Transit takes one day. No fuel cost.</small></div>
				<div class="ship-status"><svg viewBox="0 0 230 70" aria-label="Wayfarer dropship"><path d="M15 39 43 25 64 25 86 9 159 9 177 26 211 33 222 43 175 50 154 63 77 63 59 49 30 48Z"/><path class="ship-detail" d="M86 9 94 28 150 28 159 9 M77 63 94 43 151 43 154 63 M59 26 59 49 M175 26 175 50 M101 29 101 42 M142 29 142 42"/><path class="ship-engine" d="M24 32 13 32 8 42 25 42 M67 54 48 60 66 62"/></svg><div><b>IWV WAYFARER</b><span>JUMP DRIVE READY · FRAME BAY ONLINE</span></div></div>
			</section>
			<section class="contract-board" aria-labelledby="contracts-title">
				<div class="bridge-section-title"><span class="eyebrow">02 / CONTRACT EXCHANGE</span><span>${local ? 'LOCAL UPLINK' : 'REMOTE INTELLIGENCE'}</span></div>
				<h2 id="contracts-title">${active ? 'CONTRACT ACCEPTED.' : 'CHOOSE YOUR WORK.'}</h2>
				<p class="bridge-description">${active ? 'Your dropship is standing by. Select a frame and deploy to the surface.' : `Current postings on ${planet.name}. Review the opposing faction before you commit.`}</p>
				<div class="contract-list">${(active ? [active] : contracts).map(function (contract) {
					const employer = getFaction(contract.employer); const locked = campaign.reputation[contract.employer] < contract.requiredReputation;
					return html`<button class="contract-card" aria-pressed=${contract.id === selected?.id} @click=${function () { actions.selectContract(contract.id); }} data-contract=${contract.kind}><span class="contract-type">${MISSION_NAMES[contract.kind]} <em>TIER ${contract.tier}</em></span><b>${contract.title}</b><span class="contract-employer" style="color:${employer.color}">${employer.name}</span><span class="contract-bottom"><strong>${contract.reward.toLocaleString()} CR</strong><small>${active ? 'ACCEPTED · READY TO DROP' : locked ? `REQUIRES ${signed(contract.requiredReputation)} REPUTATION` : `+${contract.favor} FAVOR / −${contract.hostility} OPPOSITION`}</small></span></button>`;
				})}</div>
				${active ? html`<div class="accepted-note"><b>ACCEPTANCE RECORDED</b><p>${getFaction(active.opponent).name}: −${active.hostility} reputation already applied. Reloading lets you relaunch this same sortie without a second penalty.</p></div>` : html`<p class="board-note">Postings change after a contract or jump. Favor unlocks higher-tier work and better rates; entry contracts stay available.</p>`}
			</section>
			<aside class="contract-dossier" aria-label="Contract briefing">${selected ? html`
				<div class="bridge-section-title"><span class="eyebrow">03 / DROP BRIEFING</span><span>${active ? 'COMMITTED' : 'REVIEW'}</span></div>
				<div class="contract-symbol" aria-hidden="true">${selected.kind === 'defend' ? '◈' : selected.kind === 'demolition' ? '▥' : selected.kind === 'assassination' ? '⌖' : '⊞'}</div>
				<span class="eyebrow">${getPlanet(selected.planetId).name.toUpperCase()} / ${MISSION_NAMES[selected.kind].toUpperCase()}</span>
				<h2>${selected.title}</h2><p class="contract-briefing">${selected.briefing}</p>
				<div class="objective-brief"><span class="eyebrow">SURFACE OBJECTIVE</span><p>${OBJECTIVES[selected.kind]}</p><small>Bounded, generated battlefield · fresh frame & arsenal</small></div>
				<dl class="reputation-stakes"><dt>EMPLOYER</dt><dd>${getFaction(selected.employer).name}<strong class="positive">+${selected.favor} on success</strong></dd><dt>OPPOSITION</dt><dd>${getFaction(selected.opponent).name}<strong class="negative">−${selected.hostility} ${active ? 'applied on acceptance' : 'on acceptance'}</strong></dd><dt>PAYMENT</dt><dd>${selected.reward.toLocaleString()} CR <small>after extraction</small></dd></dl>
				${active ? html`<button id="bridge-deploy" class="primary" @click=${actions.deploy}>CHOOSE FRAME & DROP <span>↘</span></button><button class="text-button" @click=${actions.abandon}>ABORT CONTRACT</button>` : html`<button id="bridge-accept" class="primary" ?disabled=${!local || !canAcceptContract(campaign, selected)} @click=${function () { actions.accept(selected); }}>${!local ? 'TRAVEL HERE TO ACCEPT' : campaign.reputation[selected.employer] < selected.requiredReputation ? `NEEDS ${signed(selected.requiredReputation)} EMPLOYER REP` : 'ACCEPT CONTRACT'}<span>→</span></button><p class="accept-warning">Acceptance immediately changes faction standing. Failure or abort keeps the opposition penalty.</p>`}
			` : ''}</aside>
		</div>
		<section class="faction-standings" aria-label="Faction reputation"><div><span class="eyebrow">YOUR REPUTATION</span><b>EVERY CONTRACT TAKES A SIDE.</b></div>${FACTIONS.map(function (faction) { const value = campaign.reputation[faction.id]; return html`<div class="faction-standing" style="--faction-color:${faction.color}"><div><b>${faction.name}</b><strong>${signed(value)}</strong></div><span>${reputationLabel(value)}</span><div class="reputation-track"><i style="left:${value < 0 ? 50 + value / 2 : 50}%;width:${Math.abs(value) / 2}%"></i></div></div>`; })}</section>
		${campaign.lastResult ? html`<p class="campaign-log"><span>${campaign.lastResult.aborted ? 'ABORTED' : campaign.lastResult.won ? 'COMPLETED' : 'FAILED'}</span> ${campaign.lastResult.contract.title} · ${campaign.lastResult.payout.toLocaleString()} CR · ${signed(campaign.lastResult.favor)} employer favor</p>` : ''}
		<footer class="bridge-footer"><div><button @click=${actions.training}>FRAME TRAINING</button><button @click=${actions.legacy}>LAST TRANSMISSION</button><button @click=${actions.handbook}>HANDBOOK</button><button @click=${actions.settings}>SETTINGS</button></div><span class=${saved ? 'save-notice' : 'save-notice storage-warning'} role="status">${saved ? 'CAMPAIGN SAVED ON THIS DEVICE' : 'STORAGE UNAVAILABLE · SESSION ONLY'}</span><a href="../../">← DEEGEE GAMES</a></footer>
	`, root);
};
