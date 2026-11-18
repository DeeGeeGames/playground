import { MISSION_PACING } from './pacing';
import { mountGame } from '../../../shared/lifecycle';
import { createArsenalCampaign, CAMPAIGN_MISSIONS, REFIT_CHOICES, chooseRefit, SHIELD_COOLDOWN, step, type Controls, type State } from './simulation';
import { WEAPONS, WEAPON_IDS, MOUNT_SOCKETS, type WeaponId, type WeaponRank } from './weapons';
import { installStarter, draftCost, prepareDraft, applyDraft, rerollDraft, resolveDraft, weaponSummary, MAX_DRAFTS, type DraftOffer } from './arsenal';
import { createRenderer } from './render';
import { cameraFor, screenToWorld, worldToScreen, zoomForWheel } from './projection';
import { createAudio } from './audio';
import { readCampaign, writeCampaign, clearCampaign, captureCampaign, restoreCampaign } from './campaign-save';
import { createWorldRenderer } from './world';
import { createController, connectedController } from './controller';
import { readPreferences, writePreferences } from './preferences';
import { createTraining, trainingInstructions, advanceTraining, type Training } from './training';

const element = function (id: string): HTMLElement {
	const value = document.getElementById(id);
	if (!(value instanceof HTMLElement)) throw new Error(`Missing bridge element: ${id}`);
	return value;
};
const bindings = new Map([
	['KeyW', 'forward'], ['ArrowUp', 'forward'], ['KeyS', 'back'], ['ArrowDown', 'back'],
	['KeyA', 'left'], ['ArrowLeft', 'left'], ['KeyD', 'right'], ['ArrowRight', 'right'],
	['KeyX', 'neutral'], ['Space', 'brace'], ['KeyF', 'pulse'], ['KeyG', 'autoFire'],
]);
type InputMode = 'keyboard' | 'gamepad' | 'touch';
const maxAstern = 0.35;
const rudderStepPercent = 25;
const rangeKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
const driveActions = new Set(['forward', 'back', 'neutral']);
const turnActions = new Set(['left', 'right']);
const unit = function (value: number) { return Math.max(-1, Math.min(1, value)); };
const battleHints = {
	keyboard: 'Click Heading · W/S Throttle · X Neutral · A/D Rudder · Wheel Zoom',
	gamepad: 'D-pad ↑↓ Drive · LS Turn · RS ↑↓ Zoom · Start Pause',
	touch: 'Slide Throttle · Set Rudder',
};
const menuHints = {
	keyboard: 'Enter Select · Esc Back · Tab Navigate',
	gamepad: 'A Select · B Back · D-pad Navigate',
	touch: '',
};
interface BattlefieldPointer {
	type: string;
	button: number;
	startX: number;
	startY: number;
	x: number;
	y: number;
	startedAt: number;
}
const shutdown = await mountGame('game', async function (container) {
	let canvas = container.querySelector('canvas'); if (!canvas) throw new Error('Missing battlefield');
	let draw: ReturnType<typeof createWorldRenderer>;
	try { draw = createWorldRenderer(canvas); }
	catch {
		// WebGL failure can lock the original canvas to its context; replace it.
		const fallback = document.createElement('canvas'); fallback.tabIndex = 0;
		fallback.setAttribute('aria-label', canvas.getAttribute('aria-label') ?? 'Starship battlefield');
		canvas.replaceWith(fallback); canvas = fallback;
		const ctx = fallback.getContext('2d'); if (!ctx) throw new Error('Graphics unavailable');
		const render = createRenderer();
		draw = { render: function (width, height, state, reduced, briefing, zoom, heading) {
			const dpr = Math.min(devicePixelRatio, 2);
			if (fallback.width !== Math.round(width * dpr) || fallback.height !== Math.round(height * dpr)) { fallback.width = Math.round(width * dpr); fallback.height = Math.round(height * dpr); }
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0); render(ctx, width, height, state, reduced, briefing, zoom, heading);
		}, dispose: function () {} };
		container.dataset['graphics'] = 'compatibility';
	}
	const ui = {
		brief: element('brief'), pausePanel: element('pause-panel'), result: element('result'), pause: element('pause'),
		phase: element('phase'), objective: element('objective'), hull: element('hull-value'), hullFill: element('hull-fill'),
		throttle: element('throttle-value'), rudder: element('rudder-value'), speed: element('speed-value'), motion: element('motion'),
		message: element('message'), sound: element('sound'), brace: element('brace'),
		pulse: element('pulse'), pulseState: element('pulse-state'), pulseFill: element('pulse-fill'), shield: element('shield-readout'),
		autoFire: element('auto-fire'), autoState: element('auto-state'), defenseCount: element('defense-count'),
	};
	const controller = createController(true);
	const preferences = readPreferences();
	let padFrame = controller.read(undefined, 0);
	let pad: Gamepad | undefined;
	let lastPadIndex: number | undefined;
	let settingsOpen = false;
	let graphicsLost = false;
	let settingsSource: HTMLElement = element('settings-open');
	let training: Training | undefined;
	let trainingCompleted = false;
	let lastHaptic = 0;
	const audio = createAudio(); const abort = new AbortController(); const options = { signal: abort.signal };
	const keys = new Set<string>(); const pending = new Set<string>(); const pointers = new Map<number, string>();
	const battlefieldPointers = new Map<number, BattlefieldPointer>();
	let tapCandidate: number | undefined;
	let pinch: { distance: number; zoom: number } | undefined;
	let inputMode: InputMode = 'keyboard';
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	const buttons = [...container.querySelectorAll<HTMLButtonElement>('[data-action]')];
	const throttleLever = element('throttle-lever');
	const rudderLever = element('rudder-lever');
	const throttleNeutral = element('throttle-neutral');
	if (!(throttleLever instanceof HTMLInputElement) || !(rudderLever instanceof HTMLInputElement) || !(throttleNeutral instanceof HTMLButtonElement)) throw new Error('Invalid helm controls');
	const levers = [throttleLever, rudderLever];
	const leverPointers = new Map<HTMLInputElement, number>();
	let throttleOrder: number | undefined;
	let rudderOrder = 0;
	let rudderKey: string | undefined;

	let heading: number | undefined;
	let state = createArsenalCampaign(); let running = false; let paused = false; let muted = false;
	let fitting: 'starter' | 'draft' | undefined;
	let fittingStep: 'recommended' | 'weapons' | 'review' = 'recommended';
	let starterState: State | undefined;
	let selectedWeapon: WeaponId | undefined;
	let selectedOffer: number | undefined;
	let selectedOfferToken: DraftOffer | undefined;
	let selectedSocket: number | undefined;
	let confirmingRestart = false; let restartSource: HTMLElement = element('start');
	const loadedCampaign = readCampaign();
	let savedCampaign = loadedCampaign.status === 'saved' ? loadedCampaign.state : undefined;
	const setSaveStatus = function (message: string, failed = false) {
		for (const status of container.querySelectorAll<HTMLElement>('[data-save-status]')) { status.textContent = message; status.dataset['failed'] = String(failed); }
		const notice = element('save-notice'); notice.hidden = !failed; notice.textContent = failed ? message : '';
	};
	const saveCheckpoint = function () {
		if (training) return;
		const snapshot = captureCampaign(state);
		if (snapshot) savedCampaign = restoreCampaign(snapshot);
		if (writeCampaign(state)) {
			setSaveStatus(state.campaign?.phase === 'refit' ? 'Refit checkpoint saved in this browser. You can return to this choice later.' : 'Mission-start checkpoint saved. Retry restores this launch loadout and salvage; mid-mission choices roll back.');
		} else setSaveStatus('Could not save in this browser. Keep this page open to preserve your run.', true);
	};
	if (savedCampaign) {
		element('continue-campaign').hidden = false;
		element('start').textContent = 'START A NEW CAMPAIGN ↗';
		element('continue-summary').textContent = `${CAMPAIGN_MISSIONS[savedCampaign.wave - 1]?.name ?? 'Lyra Passage'} · ${savedCampaign.campaign?.phase === 'refit' ? 'refit checkpoint' : 'mission-start checkpoint'} · ${Math.ceil(savedCampaign.player.hp / savedCampaign.player.maxHp * 100)}% hull`;
		setSaveStatus('Saved locally. Continue restores the mission, launch loadout and salvage together.');
	} else if (loadedCampaign.status === 'unavailable') setSaveStatus('Browser storage is unavailable. Your campaign can only last while this page stays open.', true);
	else if (loadedCampaign.status === 'invalid') setSaveStatus('The previous checkpoint could not be read. Start a new campaign to replace it.', true);
	else setSaveStatus('Progress saves in this browser at mission starts and field refits.');
	let frame = 0; let previous = 0; let accumulator = 0; let zoom = 1;
	const clearBattlefieldPointers = function () {
		const captured = [...battlefieldPointers.keys()];
		battlefieldPointers.clear(); tapCandidate = undefined; pinch = undefined;
		for (const id of captured) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
	};
	const releaseLever = function (lever: HTMLInputElement) {
		const id = leverPointers.get(lever);
		leverPointers.delete(lever);
		if (id !== undefined && lever.hasPointerCapture(id)) lever.releasePointerCapture(id);
	};
	const centerRudder = function () {
		rudderOrder = 0;
		rudderKey = undefined;
	};
	const clearHeldInputs = function () {
		keys.clear(); pending.clear(); throttleOrder = undefined; centerRudder();
		for (const lever of levers) releaseLever(lever);
		clearBattlefieldPointers();
		for (const button of buttons) for (const id of pointers.keys()) if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
		pointers.clear();
	};
	const clearInput = function () {
		clearHeldInputs();
		heading = undefined; controller.clear(); padFrame = controller.read(undefined, 0); state.shield.held = false; state.torpedoes.held = false; state.missiles.held = false; state.fireControl.held = false;
	};
	const active = function (action: string) { return [...keys].some(function (code) { return bindings.get(code) === action; }) || pending.has(action) || [...pointers.values()].includes(action) || (action === 'brace' && padFrame.brace); };
	const manualTurn = function () { return Number(active('right')) - Number(active('left')) + padFrame.turn; };
	const turnOrder = function () { return unit(manualTurn() + rudderOrder); };
	const playable = function () { return running && !graphicsLost && !paused && !settingsOpen && !confirmingRestart && !fitting && (state.arsenal?.pending ?? 0) === 0 && state.outcome === 'playing' && state.campaign?.phase !== 'refit'; };
	const inputHint = element('input-hint');
	const updateInputHints = function () {
		const pauseLabel = paused ? 'Resume' : 'Pause';
		ui.pause.textContent = inputMode === 'touch' ? pauseLabel : `${pauseLabel} · ${inputMode === 'gamepad' ? 'Start' : 'Esc'}`;
		inputHint.textContent = (playable() ? battleHints : menuHints)[inputMode];
	};
	let refitChoice: typeof REFIT_CHOICES[number]['id'] | undefined;
	const route = element('campaign-route');
	for (const [index, mission] of CAMPAIGN_MISSIONS.entries()) {
		const item = document.createElement('li');
		const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0');
		const details = document.createElement('div');
		const name = document.createElement('strong'); name.textContent = mission.name;
		const location = document.createElement('small'); location.textContent = mission.location;
		details.append(name, location); item.append(number, details); route.append(item);
		element('mission-steps').append(document.createElement('i'));
	}
	element('mission-count').textContent = String(CAMPAIGN_MISSIONS.length).padStart(2, '0');
	const unlock = function () {
		void audio.unlock().then(function () { updateSoundLabels(); });
	};
	const syncPanels = function () {
		container.dataset['mode'] = running ? 'playing' : 'briefing';
		ui.brief.hidden = running || confirmingRestart || settingsOpen || !!fitting; ui.pausePanel.hidden = !paused || confirmingRestart || settingsOpen || !!fitting; ui.result.hidden = !running || state.outcome === 'playing' || confirmingRestart || settingsOpen || !!fitting;
		element('settings-panel').hidden = !settingsOpen;
		element('training-guide').hidden = !training || !playable();
		element('confirm-reset').hidden = !confirmingRestart || settingsOpen || !!fitting;
		element('fitting-panel').hidden = !fitting || settingsOpen;
		element('refit').hidden = !running || state.campaign?.phase !== 'refit' || state.outcome !== 'playing' || confirmingRestart || settingsOpen || !!fitting;
		const modal = [...container.querySelectorAll<HTMLElement>('.overlay')].find(function (panel) { return !panel.hidden; });
		for (const child of container.children) if (child instanceof HTMLElement) child.inert = !!modal && child !== modal;
		updateInputHints();
		if (ui.pause instanceof HTMLButtonElement) ui.pause.disabled = !running || state.outcome !== 'playing' || state.campaign?.phase === 'refit' || !!fitting;
		for (const button of buttons) button.disabled = !playable();
		for (const lever of levers) lever.disabled = !playable();
		throttleNeutral.disabled = !playable();
		for (const id of ['start', 'continue', 'training', 'restart', 'retry', 'confirm-start', 'resume']) { const button = element(id); if (button instanceof HTMLButtonElement) button.disabled = graphicsLost; }
		const deploy = element('deploy'); if (deploy instanceof HTMLButtonElement) deploy.disabled = graphicsLost || !refitChoice;
		if (fitting) updateFittingSelection();
		const inspect = element('inspect-battery'); if (inspect instanceof HTMLButtonElement) inspect.disabled = !playable();
	};
	const rankLabel = function (rank: WeaponRank) { return rank === 1 ? 'I' : rank === 2 ? 'II' : 'III'; };
	const fittingState = function () { return fitting === 'starter' ? starterState : state; };
	const weaponChoices = element('weapon-choices');
	const socketChoices = element('fitting-sockets');
	const recommendedDeploy = element('deploy-recommended');
	const confirmFit = element('confirm-fit');
	if (!(recommendedDeploy instanceof HTMLButtonElement) || !(confirmFit instanceof HTMLButtonElement)) throw new Error('Missing fitting buttons');
	const focusFit = function (control: HTMLElement | null) {
		control?.focus({ preventScroll: true });
		control?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
	};
	const clearFitSelection = function () {
		selectedWeapon = undefined; selectedOffer = undefined; selectedOfferToken = undefined; selectedSocket = undefined;
	};
	const updateFittingSelection = function () {
		recommendedDeploy.disabled = graphicsLost;
		confirmFit.disabled = graphicsLost || !selectedWeapon || (selectedOfferToken?.kind !== 'upgrade' && selectedSocket === undefined);
		const warning = element('replacement-warning');
		warning.hidden = true;
		if (fittingStep !== 'review') return;
		if (selectedOfferToken?.kind === 'upgrade') {
			const { weapon, slot, rank } = selectedOfferToken;
			confirmFit.textContent = `Upgrade ${WEAPONS[weapon].name} to ${rankLabel(rank)} in ${MOUNT_SOCKETS[slot]?.label ?? ''}`;
			return;
		}
		for (const button of socketChoices.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset['slot'] === String(selectedSocket)));
		const socket = selectedSocket === undefined ? undefined : MOUNT_SOCKETS[selectedSocket];
		if (!socket || !selectedWeapon) { confirmFit.textContent = 'Choose a socket'; return; }
		const previous = fittingState()?.arsenal?.mounts[socket.index];
		const weapon = WEAPONS[selectedWeapon];
		if (previous) {
			warning.hidden = false;
			warning.textContent = `${WEAPONS[previous.weapon].name} ${rankLabel(previous.rank)} in ${socket.label} will be removed, including its upgrades. The new turret starts at rank I.`;
		}
		confirmFit.textContent = fitting === 'starter' ? `Fit ${weapon.name} in ${socket.label} and deploy`
			: previous ? `Replace ${socket.label} with ${weapon.name} I` : `Install ${weapon.name} I in ${socket.label}`;
	};
	const showFittingStep = function (step: typeof fittingStep) {
		fittingStep = step;
		const starter = fitting === 'starter';
		const upgrade = selectedOfferToken?.kind === 'upgrade';
		element('recommended-fit').hidden = step !== 'recommended';
		weaponChoices.hidden = step !== 'weapons';
		element('fit-review').hidden = step !== 'review';
		element('upgrade-preview').hidden = !upgrade;
		element('socket-selection').hidden = upgrade;
		element('draft-alternatives').hidden = starter || step !== 'weapons';
		element('fit-navigation').hidden = !starter && step === 'weapons';
		const back = element('back-fitting');
		back.hidden = step === 'recommended' || (!starter && step === 'weapons');
		back.textContent = step === 'weapons' ? 'Back to recommended fit' : starter ? 'Choose another weapon' : 'Choose another reward';
		element('fitting-title').textContent = step === 'recommended' ? 'Ready to deploy'
			: step === 'weapons' ? starter ? 'Choose a starter weapon' : 'Choose a salvage reward'
			: upgrade ? 'Review upgrade' : 'Choose a socket';
		const copy = element('fitting-copy');
		copy.hidden = step === 'review';
		copy.textContent = step === 'recommended' ? `Survive ${MISSION_PACING[0].duration} seconds in Outer Picket. Damage enemies to earn salvage for your next fit.`
			: starter ? 'Pick a weapon to see its stats and place it on your ship.' : 'Combat is paused while you choose. Your ship keeps its momentum.';
		element('fitting-panel').scrollTop = 0;
		updateFittingSelection();
	};
	const renderFitReview = function (id: WeaponId, offer?: DraftOffer) {
		const arsenal = fittingState()?.arsenal;
		if (!arsenal) return;
		const weapon = WEAPONS[id];
		const title = document.createElement('strong');
		const detail = document.createElement('p');
		const stats = document.createElement('p');
		stats.className = 'fit-stats';
		if (offer?.kind === 'upgrade') {
			const mount = arsenal.mounts[offer.slot];
			if (!mount) return;
			title.textContent = `${MOUNT_SOCKETS[offer.slot]?.label ?? ''} · ${weapon.name} ${rankLabel(mount.rank)} → ${rankLabel(offer.rank)}`;
			detail.textContent = `Current · ${weaponSummary(id, mount.rank)}`;
			stats.textContent = `Upgraded · ${weaponSummary(id, offer.rank)}`;
			element('upgrade-preview').replaceChildren(title, detail, stats);
			showFittingStep('review'); focusFit(confirmFit);
			return;
		}

		title.textContent = `${weapon.name} I · ${weapon.family}`;
		detail.textContent = `${weapon.role} ${weapon.tradeoff}`;
		stats.textContent = weaponSummary(id, 1);
		const coverage = document.createElement('p');
		coverage.textContent = id === 'seeker' ? 'All bearings from either side.' : 'Covers the outward half of the ship on the side you choose.';
		element('install-preview').replaceChildren(title, coverage, detail, stats);
		socketChoices.replaceChildren();
		const bankSize = MOUNT_SOCKETS.length / 2;
		for (let position = 0; position < bankSize; position++) for (const bank of [0, bankSize]) {
			const socket = MOUNT_SOCKETS[position + bank]; if (!socket) continue;
			const mount = arsenal.mounts[socket.index];
			const button = document.createElement('button'); button.type = 'button'; button.dataset['slot'] = String(socket.index);
			const label = document.createElement('b'); label.textContent = socket.label;
			const fitted = document.createElement('span'); fitted.textContent = mount ? `${WEAPONS[mount.weapon].name} ${rankLabel(mount.rank)}` : 'Empty';
			button.append(label, fitted);
			button.addEventListener('click', function () {
				selectedSocket = socket.index;
				updateFittingSelection();
				if (!confirmFit.disabled) focusFit(confirmFit);
			}, options);
			socketChoices.append(button);
		}
		showFittingStep('review'); focusFit(socketChoices.querySelector('button'));
	};
	const finishDraft = function () {
		clearInput(); accumulator = 0; clearFitSelection();
		if ((state.arsenal?.pending ?? 0) > 0) { showDraft(); return; }
		fitting = undefined; syncPanels(); canvas.focus({ preventScroll: true }); unlock();
	};
	const renderFitting = function () {
		const starter = fitting === 'starter';
		const arsenal = fittingState()?.arsenal; if (!arsenal) return;
		element('fitting-eyebrow').textContent = starter ? 'INITIAL FIT / OUTER PICKET' : `SALVAGE RECOVERED / ${arsenal.pending} CHOICE${arsenal.pending === 1 ? '' : 'S'} QUEUED`;
		const cancel = element('cancel-fitting');
		cancel.hidden = !starter;
		cancel.textContent = running ? 'Return to current run' : 'Return to title';
		element('fitting-save-note').hidden = starter;
		weaponChoices.replaceChildren();
		const choice = function (id: WeaponId, index?: number) {
			const weapon = WEAPONS[id];
			const offer = index === undefined ? undefined : arsenal.offers[index];
			const upgrade = offer?.kind === 'upgrade';
			const button = document.createElement('button'); button.type = 'button'; button.dataset['weapon'] = id;
			if (index !== undefined) button.dataset['offer'] = String(index);
			button.style.setProperty('--weapon-color', weapon.color);
			const title = document.createElement('strong'); title.textContent = upgrade ? `${weapon.name} ${rankLabel(offer.rank)}` : weapon.name;
			const family = document.createElement('small'); family.textContent = upgrade ? `Upgrade ${MOUNT_SOCKETS[offer.slot]?.label ?? ''}` : starter ? weapon.family : `Install · ${weapon.family}`;
			button.append(title, family);
			button.addEventListener('click', function () {
				if (fittingStep !== 'weapons' || (index !== undefined && state.arsenal?.offers[index] !== offer)) return;
				selectedWeapon = id; selectedOffer = index; selectedOfferToken = offer; selectedSocket = undefined;
				renderFitReview(id, offer);
			}, options);
			weaponChoices.append(button);
		};
		if (starter) for (const id of WEAPON_IDS) choice(id);
		else arsenal.offers.forEach(function (offer, index) { choice(offer.weapon, index); });
		const alternatives = element('draft-alternatives'); alternatives.replaceChildren();
		if (!starter) {
			const expectedOffers = arsenal.offers;
			for (const action of ['reroll', 'repair', 'skip'] as const) {
				const button = document.createElement('button'); button.type = 'button'; button.id = `${action}-draft`;
				button.textContent = action === 'reroll' ? arsenal.rerolled ? 'Reroll used' : 'Reroll · 1 available' : action === 'repair' ? `Repair hull · ${Math.ceil(state.player.hp / state.player.maxHp * 100)}% → ${Math.ceil(Math.min(1, state.player.hp / state.player.maxHp + 0.15) * 100)}%` : 'Skip this reward';
				button.disabled = action === 'reroll' ? arsenal.rerolled : action === 'repair' && state.player.hp >= state.player.maxHp;
				button.addEventListener('click', function (event) {
					if (fitting !== 'draft' || fittingStep !== 'weapons' || state.arsenal?.offers !== expectedOffers || event.detail > 1) return;
					if (action === 'reroll') {
						if (!rerollDraft(state)) return;
						clearFitSelection(); renderFitting(); focusFit(weaponChoices.querySelector('button')); clearInput();
					} else if (resolveDraft(state, action)) finishDraft();
				}, options);
				alternatives.append(button);
			}
		}
		showFittingStep(starter ? 'recommended' : 'weapons');
	};
	const showDraft = function () {
		if (!state.arsenal || state.arsenal.pending <= 0 || state.outcome !== 'playing') return;
		prepareDraft(state); fitting = 'draft'; clearFitSelection(); clearInput(); accumulator = 0; audio.update(0, false, []);
		renderFitting(); syncPanels(); focusFit(weaponChoices.querySelector('button'));
	};
	const cancelFitting = function () {
		if (fitting !== 'starter') return;
		fitting = undefined; starterState = undefined; clearFitSelection(); clearInput(); syncPanels(); restartSource.focus({ preventScroll: true });
	};
	const backFitting = function () {
		if (fittingStep === 'review') {
			const prior = [...weaponChoices.querySelectorAll('button')].find(function (button) {
				return fitting === 'starter' ? button.dataset['weapon'] === selectedWeapon : button.dataset['offer'] === String(selectedOffer);
			});
			clearFitSelection(); showFittingStep('weapons'); focusFit(prior ?? weaponChoices.querySelector('button'));
		} else if (fitting === 'starter' && fittingStep === 'weapons') {
			showFittingStep('recommended'); focusFit(element('custom-fit'));
		} else cancelFitting();
	};
	const deployStarter = function (weapon: WeaponId, socket: number) {
		if (graphicsLost || fitting !== 'starter' || !starterState || !installStarter(starterState, weapon, socket)) return;
		state = starterState; starterState = undefined; fitting = undefined; clearFitSelection();
		training = undefined; trainingCompleted = false; running = true; paused = false; accumulator = 0; zoom = 1;
		clearInput(); saveCheckpoint(); syncPanels(); canvas.focus({ preventScroll: true }); unlock();
	};
	element('cancel-fitting').addEventListener('click', cancelFitting, options);
	element('back-fitting').addEventListener('click', backFitting, options);
	element('custom-fit').addEventListener('click', function () {
		showFittingStep('weapons'); focusFit(weaponChoices.querySelector('button'));
	}, options);
	recommendedDeploy.addEventListener('click', function () {
		if (fittingStep === 'recommended') deployStarter('seeker', 0);
	}, options);
	confirmFit.addEventListener('click', function (event) {
		if (graphicsLost || fittingStep !== 'review' || event.detail > 1 || !selectedWeapon) return;
		if (fitting === 'starter') {
			if (selectedSocket !== undefined) deployStarter(selectedWeapon, selectedSocket);
		} else if (fitting === 'draft' && selectedOffer !== undefined && selectedOfferToken && state.arsenal?.offers[selectedOffer] === selectedOfferToken && applyDraft(state, selectedOffer, selectedSocket)) finishDraft();
	}, options);
	let inspectedBuild = '';
	const updateBatteryHud = function () {
		const arsenal = state.arsenal;
		if (!arsenal) return;
		const installed = arsenal.mounts.filter(function (mount) { return mount !== null; });
		element('battery-count').textContent = `${installed.length} / ${MOUNT_SOCKETS.length}`;

		const capped = arsenal.rewards >= MAX_DRAFTS;
		const cost = draftCost(arsenal.rewards);
		const budget = MISSION_PACING[state.wave - 1]?.salvageBudget ?? Infinity;
		const sectorRecovered = (state.campaign?.clock?.salvageEarned ?? 0) >= budget;
		element('salvage-value').textContent = training ? 'PRACTICE' : capped ? 'COMPLETE' : `${Math.floor(arsenal.salvage)}/${cost}`;
		element('salvage-fill').style.width = training ? '0%' : `${capped ? 100 : Math.min(100, arsenal.salvage / cost * 100)}%`;
		element('salvage-hint').textContent = training ? 'No campaign changes' : capped ? 'All choices earned'
			: sectorRecovered ? 'Sector salvage recovered' : 'Next weapon choice';

		const engaging = installed.filter(function (mount) {
			return mount.status === 'FIRING' || mount.status === 'LOCKED' || mount.status === 'CHARGING'
				|| mount.status === 'TRACKING' || mount.status === 'RELOADING';
		});
		const lead = engaging.find(function (mount) { return mount.status === 'FIRING' || mount.status === 'LOCKED' || mount.status === 'CHARGING'; })
			?? engaging[0]
			?? installed.find(function (mount) { return mount.status === 'OUT OF RANGE' || mount.status === 'TOO CLOSE'; })
			?? installed[0];
		const readout = element('battery-lead');
		const advice = element('battery-advice');
		if (!lead) {
			readout.textContent = 'Battery empty';
			advice.textContent = '';
			readout.dataset['signal'] = 'idle';
		} else {
			const weapon = WEAPONS[lead.weapon];
			const stats = weapon.ranks[lead.rank];
			const side = MOUNT_SOCKETS[lead.slot]?.side === 'port' ? 'port' : 'starboard';
			const sideName = side === 'port' ? 'Port' : 'Starboard';
			const cues = {
				'EMPTY': 'No weapon fitted',
				'HOLD FIRE': 'Hold Fire · select Weapons Free',
				'ARMOR LOCK': 'Armor locked · release to fire',
				'OUT OF ARC': `Out of arc · turn contact onto ${side}`,
				'TOO CLOSE': `Too close · open to ${stats.minRange} m`,
				'OUT OF RANGE': `Out of range · close to ${stats.range} m`,
				'NO CONTACT': 'Scanning for contacts',
				'TRACKING': lead.weapon === 'seeker' ? 'Tracking · hold range' : 'Tracking · keep contact in arc',
				'RELOADING': 'Reloading',
				'CHARGING': 'Charging · hold bearing',
				'LOCKED': 'Aim locked · shot imminent',
				'FIRING': 'Firing',
			};
			readout.textContent = `${weapon.name} · ${sideName}${lead.weapon === 'seeker' ? ' · 360°' : ''}`;
			readout.dataset['signal'] = engaging.length ? 'engaged'
				: lead.status === 'OUT OF RANGE' || lead.status === 'TOO CLOSE' || lead.status === 'OUT OF ARC' ? 'attention' : 'idle';
			advice.textContent = installed.length > 1 && engaging.length ? `${cues[lead.status]} · ${engaging.length}/${installed.length} engaged` : cues[lead.status];
		}

		if (!paused) return;
		const signature = `${state.stats.interceptions}|${arsenal.mounts.map(function (mount) { return mount ? `${mount.weapon}:${mount.rank}:${mount.status}` : '-'; }).join('|')}`;
		if (signature === inspectedBuild) return;
		inspectedBuild = signature;
		const inspection = element('battery-inspection');
		const heading = document.createElement('h3');
		heading.textContent = `FITTED TURRETS · ${installed.length} / ${MOUNT_SOCKETS.length}`;
		inspection.replaceChildren(heading);
		for (const mount of installed) {
			const socket = MOUNT_SOCKETS[mount.slot];
			if (!socket) continue;
			const row = document.createElement('div');
			const title = document.createElement('strong');
			title.textContent = `${socket.label} · ${WEAPONS[mount.weapon].name} ${rankLabel(mount.rank)}`;
			const status = document.createElement('span');
			status.textContent = mount.status;
			const stats = document.createElement('small');
			stats.textContent = weaponSummary(mount.weapon, mount.rank);
			row.append(title, status, stats);
			inspection.append(row);
		}
		const interceptions = document.createElement('small');
		interceptions.textContent = `${state.stats.interceptions} rounds intercepted`;
		inspection.append(interceptions);
	};
	element('inspect-battery').addEventListener('click', function () { if (playable()) { pause(true); updateBatteryHud(); element('battery-inspection').scrollIntoView({ block: 'nearest', behavior: 'instant' }); } }, options);
	const start = function () {
		starterState = createArsenalCampaign(); fitting = 'starter'; clearFitSelection(); confirmingRestart = false; clearInput(); accumulator = 0;
		renderFitting(); syncPanels(); focusFit(recommendedDeploy.disabled ? element('custom-fit') : recommendedDeploy); unlock();
	};
	const pause = function (value: boolean) {
		if (!running || confirmingRestart || fitting || state.outcome !== 'playing' || state.campaign?.phase === 'refit') return;
		if (!value && graphicsLost) return;
		paused = value; if (!value) element('pause-reason').textContent = ''; clearInput(); accumulator = 0; syncPanels();
		if (paused) { audio.update(0, false, []); element('resume').focus({ preventScroll: true }); }
		else { canvas.focus({ preventScroll: true }); unlock(); }
	};
	const showRefit = function () {
		clearInput(); accumulator = 0; refitChoice = undefined; audio.update(0, false, []);
		const nextMission = CAMPAIGN_MISSIONS[state.wave];
		element('refit-summary').textContent = `${CAMPAIGN_MISSIONS[state.wave - 1]?.name ?? 'Mission'} survived. Hull ${Math.ceil(state.player.hp / state.player.maxHp * 100)}%. Battery calibrations ${state.campaign?.upgrades.rails ?? 0} · capacitor upgrades ${state.campaign?.upgrades.capacitor ?? 0}.`;
		element('next-mission-number').textContent = `NEXT / MISSION ${String(state.wave + 1).padStart(2, '0')}`;
		element('next-mission-title').textContent = nextMission?.name ?? 'Passage secured';
		element('next-mission-intel').textContent = nextMission?.briefing ?? '';
		const choices = element('refit-choices'); choices.replaceChildren();
		for (const choice of REFIT_CHOICES) {
			const label = document.createElement('label'); label.className = 'refit-choice';
			const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'refit-choice'; radio.value = choice.id;
			const details = document.createElement('span'); const name = document.createElement('strong'); const description = document.createElement('small');
			name.textContent = choice.name; description.textContent = choice.description;
			if (choice.id === 'repair') description.textContent += ` Hull after repairs: ${Math.ceil(Math.min(state.player.maxHp, state.player.hp + state.player.maxHp * 0.35) / state.player.maxHp * 100)}%.`;
			details.append(name, description); label.append(radio, details); choices.append(label);
			radio.addEventListener('change', function () {
				refitChoice = choice.id;
				const deploy = element('deploy'); if (deploy instanceof HTMLButtonElement) deploy.disabled = false;
				deploy.textContent = `COMMIT ${choice.name.toUpperCase()} & DEPLOY ↗`;
			}, options);
		}
		const deploy = element('deploy'); if (deploy instanceof HTMLButtonElement) deploy.disabled = true;
		deploy.textContent = 'SELECT A REFIT TO CONTINUE ↗';
		syncPanels(); choices.querySelector('input')?.focus({ preventScroll: true });
	};
	element('deploy').addEventListener('click', function () {
		if (graphicsLost || !refitChoice || !chooseRefit(state, refitChoice)) return;
		clearInput(); accumulator = 0; saveCheckpoint(); syncPanels(); canvas.focus({ preventScroll: true }); unlock();
	}, options);
	const cancelRestart = function () { confirmingRestart = false; syncPanels(); restartSource.focus({ preventScroll: true }); };
	for (const id of ['start', 'restart', 'reset']) element(id).addEventListener('click', function () {
		restartSource = element(id);
		if (!savedCampaign && !(running && state.outcome === 'playing')) { start(); return; }
		restartSource = element(id); confirmingRestart = true; clearInput(); syncPanels(); element('cancel-reset').focus({ preventScroll: true });
	}, options);
	element('cancel-reset').addEventListener('click', cancelRestart, options);
	element('confirm-start').addEventListener('click', start, options);
	element('continue').addEventListener('click', function () {
		if (!savedCampaign) return;
		const snapshot = captureCampaign(savedCampaign); const restored = snapshot ? restoreCampaign(snapshot) : undefined;
		if (!restored) return;
		state = restored; training = undefined; running = true; paused = false; accumulator = 0; zoom = 1; clearInput();
		if (state.campaign?.phase === 'refit') showRefit();
		else { syncPanels(); canvas.focus({ preventScroll: true }); unlock(); }
		setSaveStatus(state.campaign?.phase === 'refit' ? 'Resumed the saved refit. Choose your next upgrade or repair.' : 'Resumed the mission-start checkpoint. Your next checkpoint is after this engagement.');
	}, options);
	element('resume').addEventListener('click', function () { pause(false); }, options);
	ui.pause.addEventListener('click', function () { pause(!paused); }, options);
	const soundButtons = [ui.sound];
	for (const panel of container.querySelectorAll('.overlay .panel')) {
		const utilities = document.createElement('div'); utilities.className = 'modal-utilities';
		const sound = document.createElement('button'); sound.type = 'button'; sound.textContent = 'Sound on'; sound.setAttribute('aria-pressed', 'false'); sound.setAttribute('aria-label', 'Mute sound');
		soundButtons.push(sound); utilities.append(sound);
		if (!panel.querySelector('a[href]')) { const back = document.createElement('a'); back.href = '../../'; back.textContent = 'Return to experiments'; utilities.append(back); }
		panel.append(utilities);
	}
	const updateSoundLabels = function () {
		const status = audio.status();
		for (const sound of soundButtons) { sound.textContent = status === 'unavailable' ? 'Audio unavailable' : status === 'locked' ? 'Enable audio · click or key' : muted ? 'Sound off' : 'Sound on'; sound.setAttribute('aria-pressed', String(muted)); sound.setAttribute('aria-label', status === 'locked' ? 'Enable browser audio with a click or key press' : muted ? 'Unmute sound' : 'Mute sound'); }
	};
	updateSoundLabels();
	const toggleSound = function () {
		if (audio.status() === 'locked') { unlock(); return; }
		muted = !muted; audio.setMuted(muted);
		updateSoundLabels();
		if (!muted) unlock();
		if (playable()) canvas.focus({ preventScroll: true });
	};
	for (const sound of soundButtons) sound.addEventListener('click', toggleSound, options);
	const setInputMode = function (mode: InputMode) {
		if (container.dataset['input'] === mode && inputMode === mode) return;
		if (mode !== inputMode) {
			clearHeldInputs();
			if (inputMode === 'gamepad') { controller.clear(); padFrame = controller.read(undefined, 0); }
		}
		inputMode = mode;
		container.dataset['input'] = mode;
		for (const label of container.querySelectorAll<HTMLElement>('[data-keyboard]')) label.textContent = label.dataset[mode] ?? '';
		updateInputHints();
	};
	setInputMode(window.matchMedia('(hover: none) and (pointer: coarse)').matches ? 'touch' : 'keyboard');
	const applyPreferences = function () {
		audio.setMix(preferences);
		container.dataset['largeHud'] = String(preferences.largeHud);
		for (const [id, value] of [['master-volume', preferences.master], ['music-volume', preferences.music], ['effects-volume', preferences.effects]] as const) {
			const input = element(id); if (input instanceof HTMLInputElement) { input.value = String(value * 100); input.setAttribute('aria-valuetext', `${Math.round(value * 100)} percent`); }
			const output = container.querySelector(`output[for="${id}"]`); if (output) output.textContent = `${Math.round(value * 100)}%`;
		}
		for (const [id, value] of [['screen-shake', preferences.shake], ['vibration', preferences.vibration], ['large-hud', preferences.largeHud]] as const) {
			const input = element(id); if (input instanceof HTMLInputElement) input.checked = value;
		}
	};
	applyPreferences();
	for (const [id, key] of [['master-volume', 'master'], ['music-volume', 'music'], ['effects-volume', 'effects']] as const) {
		element(id).addEventListener('input', function (event) {
			if (!(event.target instanceof HTMLInputElement)) return;
			preferences[key] = Math.min(1, Math.max(0, event.target.valueAsNumber / 100));
			applyPreferences(); writePreferences(preferences); unlock();
		}, options);
	}
	for (const [id, key] of [['screen-shake', 'shake'], ['vibration', 'vibration'], ['large-hud', 'largeHud']] as const) {
		element(id).addEventListener('change', function (event) {
			if (!(event.target instanceof HTMLInputElement)) return;
			preferences[key] = event.target.checked; applyPreferences(); writePreferences(preferences);
		}, options);
	}
	const closeSettings = function () { settingsOpen = false; clearInput(); syncPanels(); settingsSource.focus(); audio.cue('back'); };
	for (const id of ['settings-open', 'pause-settings']) element(id).addEventListener('click', function () {
		settingsSource = element(id); settingsOpen = true; clearInput(); syncPanels(); element('master-volume').focus(); unlock();
	}, options);
	element('settings-back').addEventListener('click', closeSettings, options);
	const modalNow = function () { return [...container.querySelectorAll<HTMLElement>('.overlay')].find(function (panel) { return !panel.hidden; }); };
	const moveMenu = function (direction: 'up' | 'down' | 'left' | 'right') {
		const modal = modalNow(); if (!modal) return;
		const focused = document.activeElement;
		if (focused instanceof HTMLInputElement && focused.type === 'range' && (direction === 'left' || direction === 'right')) {
			if (direction === 'left') focused.stepDown(); else focused.stepUp();
			focused.dispatchEvent(new Event('input', { bubbles: true })); return;
		}
		const items = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)')].filter(function (item) { return !item.closest('[hidden]') && item.getClientRects().length > 0; });
		const index = items.findIndex(function (item) { return item === focused; });
		const offset = direction === 'up' || direction === 'left' ? -1 : 1;
		const next = items[(index + offset + items.length) % items.length];
		next?.focus({ preventScroll: true }); next?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); audio.cue('focus');
	};
	const returnToTitle = function () {
		training = undefined; trainingCompleted = false; running = false; paused = false; settingsOpen = false; fitting = undefined; starterState = undefined; clearInput();
		state = createArsenalCampaign();
		element('continue-campaign').hidden = !savedCampaign;
		if (savedCampaign) element('continue-summary').textContent = `${CAMPAIGN_MISSIONS[savedCampaign.wave - 1]?.name ?? 'Lyra Passage'} · ${savedCampaign.campaign?.phase === 'refit' ? 'field refit' : 'mission checkpoint'} · ${Math.ceil(savedCampaign.player.hp / savedCampaign.player.maxHp * 100)}% hull`;
		syncPanels(); element(savedCampaign ? 'continue' : 'start').focus();
	};
	const titleButton = document.createElement('button'); titleButton.className = 'secondary'; titleButton.textContent = 'Return to title'; titleButton.id = 'return-title';
	element('reset').after(titleButton); titleButton.addEventListener('click', returnToTitle, options);
	element('training').addEventListener('click', function () {
		const flight = createTraining(); state = flight.state; training = flight.training; trainingCompleted = false;
		running = true; paused = false; zoom = 1; accumulator = 0; clearInput(); syncPanels(); canvas.focus(); unlock();
	}, options);
	element('training-skip').addEventListener('click', returnToTitle, options);
	const retry = function () {
		if (!savedCampaign) return;
		const snapshot = captureCampaign(savedCampaign); const restored = snapshot ? restoreCampaign(snapshot) : undefined; if (!restored) return;
		state = restored; training = undefined; trainingCompleted = false; running = true; paused = false; clearInput(); accumulator = 0;
		if (state.campaign?.phase === 'refit') showRefit(); else { syncPanels(); canvas.focus(); }
		unlock();
	};
	element('retry').addEventListener('click', retry, options);
	container.addEventListener('pointerdown', function (event) { setInputMode(event.pointerType === 'touch' ? 'touch' : 'keyboard'); unlock(); }, { ...options, capture: true });
	const updateController = function (now: number, elapsed: number) {
		pad = connectedController();
		if (lastPadIndex !== undefined && pad?.index !== lastPadIndex) {
			clearInput(); pause(true); element('pause-reason').textContent = 'Controller disconnected. Reconnect, then press A to resume.';
		}
		lastPadIndex = pad?.index;
		element('controller-status').textContent = pad ? 'Controller connected' : 'Keyboard + mouse · Standard controllers supported';
		padFrame = controller.read(pad, now);
		if (document.hidden || !document.hasFocus()) { controller.clear(); padFrame = controller.read(undefined, now); return; }
		if (padFrame.used) setInputMode('gamepad');
		const modal = modalNow();
		if (modal) {
			if (padFrame.direction) moveMenu(padFrame.direction);
			if (padFrame.cancel || padFrame.pause) {
				if (settingsOpen) closeSettings(); else if (fitting) backFitting(); else if (confirmingRestart) cancelRestart(); else if (paused) pause(false); else if (state.outcome !== 'playing') returnToTitle();
				return;
			}
			if (padFrame.confirm && document.activeElement instanceof HTMLElement && modal.contains(document.activeElement)) { unlock(); audio.cue('confirm'); document.activeElement.click(); }
			return;
		}
		if (padFrame.pause) { pause(true); return; }
		if (!playable()) return;
		if (padFrame.turn !== 0 && !leverPointers.has(rudderLever)) centerRudder();
		for (const action of ['pulse', 'neutral', 'autoFire'] as const) if (padFrame[action]) pending.add(action);
		if (!pinch) zoom = Math.min(2.5, Math.max(0.5, zoom + padFrame.zoom * elapsed * 0.65));
	};
	const cancelThrottleDrag = function () {
		throttleOrder = undefined;
		releaseLever(throttleLever);
	};
	const setRudder = function (order: number) {
		rudderOrder = order;
		heading = undefined;
	};
	const clearKeyActions = function (actions: ReadonlySet<string>) {
		for (const code of keys) {
			const action = bindings.get(code);
			if (action && actions.has(action)) keys.delete(code);
		}
		for (const action of actions) pending.delete(action);
	};
	window.addEventListener('keydown', function (event) {
		if (event.repeat && inputMode !== 'keyboard') { event.preventDefault(); return; }
		if (audio.status() === 'locked') unlock();
		if (event.code === 'Tab') {
			const modal = [...container.querySelectorAll<HTMLElement>('.overlay')].find(function (panel) { return !panel.hidden; });
			if (modal) {
				const candidates = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)')].filter(function (candidate) { return !candidate.closest('[hidden]') && candidate.getClientRects().length > 0; });
				const focusable = candidates.filter(function (candidate) {
					if (!(candidate instanceof HTMLInputElement) || candidate.type !== 'radio') return true;
					const group = candidates.filter(function (item): item is HTMLInputElement { return item instanceof HTMLInputElement && item.type === 'radio' && item.name === candidate.name; });
					return candidate === (group.find(function (item) { return item.checked; }) ?? group[0]);
				});
				const first = focusable[0]; const last = focusable.at(-1);
				if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
				else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
			}
		}
		setInputMode('keyboard');
		if (modalNow() && event.repeat && (event.code === 'Enter' || event.code === 'Space')) { event.preventDefault(); return; }
		if (event.code === 'Enter' && event.target instanceof HTMLInputElement && event.target.name === 'refit-choice') {
			event.preventDefault(); event.target.click(); return;
		}
		if (modalNow() && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) { event.preventDefault(); moveMenu(event.code === 'ArrowUp' ? 'up' : event.code === 'ArrowDown' ? 'down' : event.code === 'ArrowLeft' ? 'left' : 'right'); return; }
		if (event.code === 'Escape') { if (settingsOpen) { event.preventDefault(); closeSettings(); return; } event.preventDefault(); if (!event.repeat) { if (fitting) backFitting(); else if (confirmingRestart) cancelRestart(); else if (running && state.outcome !== 'playing') returnToTitle(); else pause(!paused); } return; }
		if (playable() && rangeKeys.has(event.code)) {
			if (event.target === throttleLever) {
				releaseLever(throttleLever);
				return;
			}
			if (event.target === rudderLever) {
				event.preventDefault();
				if (event.repeat && rudderKey !== event.code) return;
				releaseLever(rudderLever);
				clearKeyActions(turnActions);
				rudderKey = event.code;
				const increase = event.code === 'ArrowUp' || event.code === 'ArrowRight' || event.code === 'PageUp';
				const step = rudderStepPercent / 100;
				setRudder(event.code === 'Home' ? -1 : event.code === 'End' ? 1 : unit(rudderOrder + (increase ? step : -step)));
				return;
			}
		}
		const action = bindings.get(event.code); if (!action || !playable()) return;
		if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
		if (event.repeat && !keys.has(event.code)) return;
		if (driveActions.has(action)) cancelThrottleDrag();
		if (turnActions.has(action)) { releaseLever(rudderLever); centerRudder(); }
		event.preventDefault(); keys.add(event.code); if (!event.repeat) pending.add(action);
	}, options);
	window.addEventListener('keyup', function (event) {
		keys.delete(event.code);
		if (event.code === rudderKey) rudderKey = undefined;
	}, options);
	window.addEventListener('blur', function () { clearInput(); pause(true); audio.update(0, false, []); }, options);
	window.screen.orientation?.addEventListener('change', clearInput, options);
	window.matchMedia('(orientation: portrait)').addEventListener('change', clearInput, options);
	canvas.addEventListener('webglcontextlost', function (event) {
		event.preventDefault(); graphicsLost = true; clearInput(); pause(true); syncPanels();
		element('pause-reason').textContent = 'Graphics device interrupted. Waiting for recovery; reload to restore your checkpoint if it does not return.';
		element('error').hidden = false; element('error').textContent = 'Graphics device interrupted. Waiting for recovery.';
	}, options);
	canvas.addEventListener('webglcontextrestored', function () {
		graphicsLost = false; element('error').hidden = true; clearInput(); syncPanels();
		element('pause-reason').textContent = 'Graphics restored. Resume when ready.';
		const modal = modalNow(); if (modal && !modal.contains(document.activeElement)) moveMenu('down');
	}, options);
	document.addEventListener('visibilitychange', function () { if (document.hidden) { clearInput(); pause(true); audio.update(0, false, []); } }, options);
	const release = function (event: PointerEvent) { pointers.delete(event.pointerId); };
	window.addEventListener('pointerup', release, options); window.addEventListener('pointercancel', release, options);
	const setThrottle = function (order: number) {
		clearKeyActions(driveActions);
		throttleOrder = order < 0 ? order * maxAstern : order;
	};
	throttleLever.addEventListener('input', function () {
		if (playable() && Number.isFinite(throttleLever.valueAsNumber)) setThrottle(unit(throttleLever.valueAsNumber / 100));
	}, options);
	throttleNeutral.addEventListener('click', function (event) {
		if (!playable()) return;
		releaseLever(throttleLever);
		setThrottle(0);
		if (event.detail > 0) canvas.focus({ preventScroll: true });
	}, options);
	throttleLever.addEventListener('blur', function () {
		if (inputMode === 'keyboard' && leverPointers.has(throttleLever)) cancelThrottleDrag();
	}, options);
	// Handle each range's pointer separately so two fingers can operate the helm.
	for (const lever of levers) {
		const isThrottle = lever === throttleLever;
		const samplePointer = function (event: PointerEvent, step = 1) {
			const rect = lever.getBoundingClientRect();
			const thumbSize = Number.parseFloat(getComputedStyle(lever).getPropertyValue(isThrottle ? '--thumb-height' : '--thumb-width')) || 0;
			const travel = (isThrottle ? rect.height : rect.width) - thumbSize;
			if (travel <= 0) return;
			const offset = isThrottle ? rect.bottom - event.clientY : event.clientX - rect.left;
			const fraction = (offset - thumbSize / 2) / travel;
			const percent = unit(fraction * 2 - 1) * 100;
			const order = Math.sign(percent) * Math.round(Math.abs(percent) / step) * step / 100;
			if (isThrottle) setThrottle(order); else setRudder(order);
		};
		lever.addEventListener('pointerdown', function (event) {
			if (!playable() || event.button !== 0 || leverPointers.has(lever)) return;
			event.preventDefault();
			if (event.pointerType !== 'touch') canvas.focus({ preventScroll: true });
			if (!isThrottle) { clearKeyActions(turnActions); centerRudder(); }
			lever.setPointerCapture(event.pointerId);
			leverPointers.set(lever, event.pointerId);
			samplePointer(event);
		}, options);
		lever.addEventListener('pointermove', function (event) {
			if (leverPointers.get(lever) === event.pointerId && playable()) samplePointer(event);
		}, options);
		lever.addEventListener('pointerup', function (event) {
			if (leverPointers.get(lever) !== event.pointerId) return;
			if (playable()) samplePointer(event, isThrottle ? 1 : rudderStepPercent);
			releaseLever(lever);
		}, options);
		const cancel = function (event: PointerEvent) {
			if (leverPointers.get(lever) !== event.pointerId) return;
			if (isThrottle) throttleOrder = undefined; else centerRudder();
			releaseLever(lever);
		};
		lever.addEventListener('pointercancel', cancel, options);
		lever.addEventListener('lostpointercapture', cancel, options);
	}
	for (const button of buttons) {
		button.addEventListener('pointerdown', function (event) {
			const action = button.dataset['action']; if (!action || !playable() || event.button !== 0) return;
			event.preventDefault(); button.setPointerCapture(event.pointerId); pointers.set(event.pointerId, action);
		}, options);
		button.addEventListener('pointerup', function (event) {
			const action = pointers.get(event.pointerId);
			if (action && action !== 'brace' && playable() && button.contains(document.elementFromPoint(event.clientX, event.clientY))) pending.add(action);
		}, options);
		button.addEventListener('lostpointercapture', release, options);
		button.addEventListener('click', function (event) {
			const action = button.dataset['action']; if (event.detail !== 0 || !action || !playable()) return;
			pending.add(action);
		}, options);
	}

	canvas.addEventListener('wheel', function (event) {
		if (!playable() || event.ctrlKey || event.metaKey) return;
		event.preventDefault();
		if (!pinch) zoom = zoomForWheel(zoom, event, canvas.getBoundingClientRect().height);
	}, { ...options, passive: false });
	canvas.addEventListener('contextmenu', function (event) {
		if (playable()) event.preventDefault();
	}, options);
	const orderHeading = function (event: PointerEvent) {
		if (leverPointers.has(rudderLever) || rudderKey !== undefined || manualTurn() !== 0) return;
		const rect = canvas.getBoundingClientRect();
		const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
		const camera = cameraFor(rect.width, rect.height, state.player, zoom);
		const ship = worldToScreen(state.player, camera, 20);
		const deadZone = Math.max(36, state.player.length * camera.scale * 0.5 + 10);
		if (Math.hypot(point.x - ship.x, point.y - ship.y) <= deadZone) return;
		const world = screenToWorld(point, camera, 20);
		centerRudder();
		heading = Math.atan2(world.y - state.player.y, world.x - state.player.x);
	};
	const pinchDistance = function () {
		if (battlefieldPointers.size !== 2) return undefined;
		const [first, second] = battlefieldPointers.values();
		return first && second ? Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)) : undefined;
	};
	const beginPinch = function () {
		const distance = pinchDistance();
		pinch = distance === undefined ? undefined : { distance, zoom };
	};
	const tapStayedClose = function (pointer: BattlefieldPointer, event: PointerEvent) {
		return Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) <= (pointer.type === 'touch' ? 12 : 6);
	};
	canvas.addEventListener('pointerdown', function (event) {
		if (!playable() || (event.button !== 0 && !(event.button === 2 && event.pointerType === 'mouse'))) return;
		const first = battlefieldPointers.values().next().value;
		if (first && (first.type !== 'touch' || event.pointerType !== 'touch')) return;
		event.preventDefault(); canvas.setPointerCapture(event.pointerId);
		tapCandidate = first ? undefined : event.pointerId;
		battlefieldPointers.set(event.pointerId, {
			type: event.pointerType, button: event.button, startedAt: event.timeStamp,
			startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY,
		});
		beginPinch();
		canvas.focus({ preventScroll: true });
	}, options);
	canvas.addEventListener('pointermove', function (event) {
		const pointer = battlefieldPointers.get(event.pointerId);
		if (!pointer || !playable()) return;
		pointer.x = event.clientX; pointer.y = event.clientY;
		if (tapCandidate === event.pointerId && !tapStayedClose(pointer, event)) tapCandidate = undefined;
		const distance = pinchDistance();
		if (pinch && distance !== undefined) zoom = Math.min(2.5, Math.max(0.5, pinch.zoom * distance / pinch.distance));
	}, options);
	canvas.addEventListener('pointerup', function (event) {
		const pointer = battlefieldPointers.get(event.pointerId);
		if (!pointer) return;
		battlefieldPointers.delete(event.pointerId);
		const isTap = tapCandidate === event.pointerId && event.button === pointer.button && tapStayedClose(pointer, event)
			&& (pointer.type !== 'touch' || event.timeStamp - pointer.startedAt <= 500);
		tapCandidate = undefined;
		beginPinch();
		if (isTap && playable() && document.elementFromPoint(event.clientX, event.clientY) === canvas) orderHeading(event);
	}, options);
	const cancelBattlefieldGesture = function (event: PointerEvent) {
		if (battlefieldPointers.has(event.pointerId)) clearBattlefieldPointers();
	};
	canvas.addEventListener('pointercancel', cancelBattlefieldGesture, options);
	canvas.addEventListener('lostpointercapture', cancelBattlefieldGesture, options);
	const hud = function () {
		if (training) {
			const instruction = trainingInstructions[training.lesson];
			element('training-title').textContent = instruction?.title ?? 'Flight school complete';
			element('training-copy').textContent = instruction?.[inputMode] ?? '';
			element('training-progress').textContent = `${training.lesson + 1} / ${trainingInstructions.length}`;
		}
		const p = state.player;
		const speed = Math.hypot(p.vx, p.vy);
		updateBatteryHud();
		const shieldActive = state.shield.active > 0;
		const shieldCooling = state.shield.cooldown > 0;
		const recovery = Math.max(6, SHIELD_COOLDOWN - (state.campaign?.upgrades.capacitor ?? 0) * 3);
		const shieldText = shieldActive ? `${state.shield.active.toFixed(1)} s active`
			: shieldCooling ? `${Math.ceil(state.shield.cooldown)} s cooldown` : 'Ready';
		ui.shield.textContent = shieldText;
		ui.pulseState.textContent = shieldActive || shieldCooling ? shieldText : 'Ready · 3 s';
		ui.pulseFill.style.width = `${(1 - state.shield.cooldown / recovery) * 100}%`;
		ui.pulse.classList.toggle('cooling', shieldCooling && !shieldActive);
		element('brace-state').textContent = p.braced ? 'Active · guns held' : 'Hold · −65%';
		element('fire-policy').textContent = state.fireControl.automatic ? 'WEAPONS FREE' : 'HOLD FIRE';
		ui.autoState.textContent = p.braced ? 'Armor locked' : state.fireControl.automatic ? 'Automatic fire' : 'Turrets held';
		ui.autoFire.setAttribute('aria-pressed', String(state.fireControl.automatic));
		ui.autoFire.setAttribute('aria-label', state.fireControl.automatic ? 'Weapons Free. Toggle Hold Fire' : 'Hold Fire. Toggle Weapons Free');
		ui.defenseCount.textContent = `${state.stats.interceptions} INTERCEPTS`;
		for (const [i, marker] of [...container.querySelectorAll('.mission-steps i')].entries()) {
			marker.classList.toggle('active', i + 1 === state.wave); marker.classList.toggle('complete', i + 1 < state.wave);
		}
		const mission = CAMPAIGN_MISSIONS[state.wave - 1];
		const transitSeconds = Math.max(0, Math.ceil((MISSION_PACING[state.wave - 1]?.duration ?? 0) - (state.campaign?.clock?.elapsed ?? 0)));
		const minutes = String(Math.floor(transitSeconds / 60)).padStart(2, '0');
		const seconds = String(transitSeconds % 60).padStart(2, '0');
		ui.phase.textContent = training ? 'FLIGHT SCHOOL' : `${String(state.wave).padStart(2, '0')} / ${String(CAMPAIGN_MISSIONS.length).padStart(2, '0')} · ${mission?.name.toUpperCase() ?? ''}`;
		ui.objective.textContent = training ? 'DRILL' : transitSeconds > 0 ? `${minutes}:${seconds}` : 'OPEN';
		element('transit-order').textContent = training ? 'Live practice' : transitSeconds > 0 ? 'Survive to transit' : 'Transit window';
		const hullFraction = Math.max(0, p.hp / p.maxHp);
		ui.hull.textContent = String(Math.ceil(hullFraction * 100));
		ui.hullFill.style.width = `${hullFraction * 100}%`;
		ui.hullFill.style.backgroundColor = hullFraction < 0.3 ? 'var(--danger)' : 'var(--cyan)';
		ui.hull.dataset['critical'] = String(hullFraction < 0.3);
		const throttle = throttleOrder ?? p.throttle;
		const throttlePercent = Math.round(throttle / (throttle < 0 ? maxAstern : 1) * 100);
		const rudderPercent = playable() ? Math.round(turnOrder() * 100) : 0;
		const throttleText = throttlePercent === 0 ? 'NEUTRAL' : `${throttlePercent < 0 ? 'ASTERN' : 'AHEAD'} ${Math.abs(throttlePercent)}%`;
		const rudderText = rudderPercent === 0 ? 'CENTERED' : `${rudderPercent < 0 ? 'PORT' : 'STARBOARD'} ${Math.abs(rudderPercent)}%`;
		if (throttleLever.valueAsNumber !== throttlePercent) throttleLever.valueAsNumber = throttlePercent;
		if (rudderLever.valueAsNumber !== rudderPercent) rudderLever.valueAsNumber = rudderPercent;
		if (ui.throttle.textContent !== throttleText) ui.throttle.textContent = throttleText;
		if (ui.rudder.textContent !== rudderText) ui.rudder.textContent = rudderText;
		ui.speed.textContent = `${Math.round(p.vx * Math.cos(p.angle) + p.vy * Math.sin(p.angle))} M/S`;
		ui.motion.textContent = Math.abs(p.yaw) >= 0.015 ? `TURN ${p.yaw < 0 ? 'PORT' : 'STBD'} ${Math.abs(p.yaw * 180 / Math.PI).toFixed(0)}°/S`
			: speed < 1 ? 'DRIVE IDLE' : Math.abs(p.throttle) < 0.001 ? 'COASTING' : 'UNDER THRUST';

		for (const button of buttons) button.classList.toggle('pressed', playable() && active(button.dataset['action'] ?? ''));
		ui.brace.classList.toggle('pressed', playable() && p.braced);
		ui.pulse.classList.toggle('pressed', playable() && shieldActive);
		ui.autoFire.classList.toggle('pressed', state.fireControl.automatic);
		const volley = state.enemies.some(function (enemy) { return enemy.hp > 0 && enemy.warning > 0; });
		ui.message.dataset['danger'] = String(volley);
		const alert = !playable() ? '' : state.intermission > 0
			? state.wave === CAMPAIGN_MISSIONS.length ? 'Final contact clear · passage secured' : `Contact clear · refit in ${Math.max(0, Math.ceil(6 - state.intermission))} s`
			: volley ? `Incoming volley · ${shieldActive ? 'Aegis active' : p.braced ? 'armor locked' : 'turn, lock armor or use Aegis'}` : '';
		if (ui.message.textContent !== alert) ui.message.textContent = alert;
	};
	const showResult = function () {
		if (state.outcome === 'won') { savedCampaign = undefined; if (clearCampaign()) setSaveStatus('Campaign complete. Start a new run when ready.'); else setSaveStatus('Campaign complete. Browser could not clear the old checkpoint.', true); }
		else setSaveStatus('Your mission checkpoint is preserved. Retry with a different approach.');
		element('retry').hidden = state.outcome !== 'lost' || !savedCampaign;
		clearInput(); syncPanels(); audio.update(0, false, []);
		element('result-title').textContent = state.outcome === 'won' ? 'BLOCKADE BROKEN.' : 'SIGNAL LOST.';
		element('result-copy').textContent = state.outcome === 'won' ? `All ${CAMPAIGN_MISSIONS.length} missions complete. The transit window is open. Your cruiser leaves the Lyra Passage with ${Math.ceil(state.player.hp / state.player.maxHp * 100)}% hull.` : `Lost during ${CAMPAIGN_MISSIONS[state.wave - 1]?.name ?? 'the engagement'}. ${state.campaign?.completedMissions ?? 0} of ${CAMPAIGN_MISSIONS.length} missions secured. Change heading when hostile volleys are marked, and consider repairs before the next engagement.`;
		element('result-stats').textContent = `${state.kills} ships broken · ${Math.floor(state.time / 60)}m ${Math.floor(state.time % 60)}s · ${state.arsenal?.mounts.filter(function (mount) { return mount !== null; }).length ?? 0} fitted turrets · ${state.arsenal?.rewards ?? 0} salvage rewards · ${state.stats.interceptions} rounds intercepted · ${Math.round(state.stats.damageBlocked)} damage prevented by armor / shields`;
		element(state.outcome === 'lost' && savedCampaign ? 'retry' : 'restart').focus({ preventScroll: true });
	};
	const tick = function (now: number) {
		const elapsed = previous ? Math.min((now - previous) / 1000, 0.1) : 0; previous = now;
		audio.setScene(document.hidden || !document.hasFocus() || confirmingRestart || (paused && !settingsOpen) ? 'paused' : !running || settingsOpen ? 'menu' : state.outcome === 'won' ? 'victory' : state.outcome === 'lost' ? 'defeat' : state.campaign?.phase === 'refit' || fitting ? 'refit' : 'combat', state.enemies.some(function (enemy) { return enemy.warning > 0; }) ? 1 : 1 - state.player.hp / state.player.maxHp);
		if (playable() && !document.hidden) {
			accumulator += elapsed;
			while (accumulator >= 1 / 60 && playable()) {
				const turn = turnOrder();
				if (turn !== 0) heading = undefined;
				const drive = throttleOrder === undefined && !leverPointers.has(throttleLever)
					? unit(Number(active('forward')) - Number(active('back')) + padFrame.drive) : 0;
				if (throttleOrder !== undefined) state.player.throttle = throttleOrder;
				throttleOrder = undefined;
				const input: Controls = { drive, turn,
					...(heading === undefined ? {} : { heading }), neutral: active('neutral'), port: false, starboard: false, brace: active('brace'),
					pulse: pending.has('pulse'), torpedo: false, autoFire: pending.has('autoFire'), beam: false, missile: false };
				step(state, input, 1 / 60); pending.clear(); accumulator -= 1 / 60;
				audio.update(Math.hypot(state.player.vx, state.player.vy), true, state.events); audio.setBeam(false);
				if (preferences.vibration && pad && now - lastHaptic > 180 && state.events.some(function (event) { return event === 'damage' || event === 'cannon' || event === 'explosion'; })) {
					lastHaptic = now; const strong = state.events.includes('damage') ? 0.55 : 0.2;
					void pad.vibrationActuator?.playEffect('dual-rumble', { duration: 100, strongMagnitude: strong, weakMagnitude: 0.25 }).catch(function () {});
				}
				if (training && advanceTraining(training, state, input, 1 / 60)) {
					trainingCompleted = true; training = undefined; state.outcome = 'won'; clearInput(); syncPanels();
					element('result-title').textContent = 'READY FOR COMMAND.';
					element('result-copy').textContent = 'Flight school complete. You have flown, controlled autonomous fire, chosen a battery upgrade, watched a charged beam, and used both defenses. The Lyra Passage awaits.';
					element('result-stats').textContent = 'Campaign saves are untouched. Start a new campaign or press Back to return to the title.';
					element('retry').hidden = true; element('restart').focus();
				}

				if (state.outcome !== 'playing' && !trainingCompleted) showResult();
				else if ((state.arsenal?.pending ?? 0) > 0) showDraft();
				else if (state.campaign?.phase === 'refit') { saveCheckpoint(); showRefit(); }
			}
		}
		const { width, height } = canvas.getBoundingClientRect();
		draw.render(width, height, starterState ?? state, reducedMotion.matches || !preferences.shake, !running, zoom, heading); hud();
		frame = requestAnimationFrame(tick);
	};
	syncPanels(); element(savedCampaign ? 'continue' : 'start').focus({ preventScroll: true }); frame = requestAnimationFrame(tick);
	const controllerTimer = window.setInterval(function () { updateController(performance.now(), 1 / 60); }, 1000 / 60);
	return async function () { clearInterval(controllerTimer); cancelAnimationFrame(frame); clearInput(); abort.abort(); draw.dispose(); await audio.dispose(); };
});
if (import.meta.hot) import.meta.hot.dispose(shutdown);
