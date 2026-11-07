import { DRAFT_MILESTONES, getWeapon, type WeaponId } from './arsenal';
import { FRAMES, getFrame, type FrameId } from './frames';
import { frameCard, MOUNTS, mountSummary, rankLabel, weaponCard } from './loadout-ui';
import { mountGame } from '../../../shared/lifecycle';
import { applyRefit, chooseWeapon, createMissionState, createState, distance, getOperationReport, step, type Controls, type Point } from './simulation';
import { DIFFICULTIES, getWaveDefinition, REFITS, TOTAL_HOSTILES, WAVES } from './operation';
import { createPresentation } from './presentation';
import { advanceGaits, createGaits } from './gait';
import { viewScale } from './projection-3d';
import type { ScreenRect } from './overlay';
import { createAudio } from './audio';
import { createGamepadInput, type PadInput } from './gamepad';
import { createControllerFeedback } from './controller-feedback';
import { createTraining, stepTraining, trainingCopy, type Training } from './training';
import { addOperationRecord, isDifficulty, readProfile, saveProfile } from './profile';
import { abandonContract, acceptContract, getFaction, getPlanet, readCampaign, saveCampaign, settleContract, travelTo } from './campaign';
import { MISSION_NAMES, renderBridge } from './campaign-ui';
import type { PlanetId } from './campaign-types';
import { missionObjective } from './missions';

const element = function (id: string): HTMLElement {
	const value = document.getElementById(id);
	if (!(value instanceof HTMLElement)) throw new Error(`Missing interface element: ${id}`);
	return value;
};
const inputElement = function (id: string): HTMLInputElement {
	const value = element(id);
	if (!(value instanceof HTMLInputElement)) throw new Error(`Missing input: ${id}`);
	return value;
};
const bindings = new Map([
	['KeyW', 'forward'], ['ArrowUp', 'forward'], ['KeyS', 'back'], ['ArrowDown', 'back'],
	['KeyA', 'left'], ['ArrowLeft', 'left'], ['KeyD', 'right'], ['ArrowRight', 'right'],
	['KeyX', 'stop'], ['Space', 'mount-0'], ['KeyE', 'mount-1'], ['KeyQ', 'mount-2'], ['KeyF', 'mount-3'], ['KeyV', 'coolant'],
	['Digit1', 'mount-0'], ['Digit2', 'mount-1'], ['Digit3', 'mount-2'], ['Digit4', 'mount-3'],
]);
const formatTime = function (time: number) { return `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`; };
type Screen = 'bridge' | 'jump' | 'brief' | 'playing' | 'pause-panel' | 'refit' | 'result' | 'training-result' | 'loadout' | 'requisition';
type Auxiliary = 'settings' | 'handbook' | 'confirm';
const shutdown = await mountGame('game', async function (container) {
	const canvas = container.querySelector('canvas');
	if (!canvas) throw new Error('Missing battlefield');
	canvas.tabIndex = 0;
	const presentation = await createPresentation(canvas);
	const audio = createAudio();
	const padInput = createGamepadInput();
	const feedback = createControllerFeedback();
	let profile = readProfile();
	let campaign = readCampaign();
	let campaignSaved = saveCampaign(campaign);
	let campaignMode = true;
	let destination: PlanetId = campaign.planetId;
	let selectedContract: string | undefined;
	let jumpUntil = 0;
	const abort = new AbortController(); const listenerOptions = { signal: abort.signal };
	const keys = new Set<string>(); const pending = new Set<string>(); const held = new Map<number, string>();
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	const coarsePointer = window.matchMedia('(pointer: coarse)');
	const ui = {
		phase: element('phase'), status: element('status'), armor: element('armor-value'), armorFill: element('armor-fill'),
		relay: element('relay-value'), relayFill: element('relay-fill'), heat: element('heat-value'), heatFill: element('heat-fill'),
		drive: element('drive-value'), throttleFill: element('throttle-fill'), speed: element('speed-value'),
		coolant: element('coolant-value'), message: element('message'),
		sound: element('sound'), hint: element('pilot-hint'), hintCopy: element('hint-copy'), inputMode: element('input-mode'),
	};
	const cockpitElements = [...container.querySelectorAll<HTMLElement>('.left-instruments, .weapon-console, #touch, #training-guide')];
	let hudObstructions: ScreenRect[] = [];
	const weaponButtons = MOUNTS.map(function (binding) {
		const button = document.createElement('button'); button.className = 'weapon'; button.dataset['control'] = binding.action;
		button.innerHTML = '<span class="weapon-icon" aria-hidden="true"></span><b></b><small><kbd></kbd></small><em></em><i></i>';
		return button;
	});
	element('weapon-bank').replaceChildren(...weaponButtons);
	let training: Training | undefined;
	let screen: Screen = 'bridge'; let auxiliary: Auxiliary | undefined;
	let selectedFrame: FrameId = 'warden';
	const mouseButtons = new Set<number>();
	const consumedMouseButtons = new Set<number>();
	let state = createState({ difficulty: profile.settings.difficulty }); let gaits = createGaits(state); let muted = false;
	let aim: Point = { x: 900, y: 450 }; let pointer: Point | undefined; let aimMode: 'pointer' | 'gamepad' = 'pointer';
	let frame = 0; let previous = 0; let accumulator = 0; let lastHud = 0;
	let message = ''; let messageUntil = 0; let terminalUntil = 0; let contextLost = false; let focused = true;
	let returnFocus: HTMLElement | undefined; let confirmedAction: (() => void) | undefined; let tipDismissed = false;
	let inputMode: 'keyboard' | 'gamepad' | 'touch' = 'keyboard'; let controllerLost = false; let screenRevision = 0;
	let currentPad: PadInput | undefined;
	let lastSoundState = '';
	const resetInput = function () { keys.clear(); pending.clear(); held.clear(); mouseButtons.clear(); padInput.requireNeutral(); void feedback.stop(); };
	const playing = function () { return screen === 'playing' && !auxiliary && !contextLost && !document.hidden && focused; };
	const active = function (action: string) { return MOUNTS.some(function (binding) { return binding.action === action && mouseButtons.has(binding.button); }) || [...keys].some(function (code) { return bindings.get(code) === action; }) || pending.has(action) || [...held.values()].includes(action); };
	const silenceAudio = function () { audio.update({ speed: 0, laser: false, heat: 0, active: false }); };
	const motionReduced = function () { return reducedMotion.matches || profile.settings.reducedMotion; };
	const unlockSound = function () { void audio.unlock(); };
	const setInputMode = function (value: typeof inputMode) {
		if (inputMode === value && container.dataset['input'] === value && container.classList.contains('couch-ui') === (value === 'gamepad' || profile.settings.couchUI)) return;
		inputMode = value; container.dataset['input'] = value;
		container.classList.toggle('using-gamepad', value === 'gamepad');
		container.classList.toggle('couch-ui', value === 'gamepad' || profile.settings.couchUI);
		ui.inputMode.textContent = value === 'gamepad' ? 'GAMEPAD' : value === 'touch' ? 'TOUCH' : 'KB / MOUSE';
		const prompts = [['#pause kbd', 'Esc', 'Menu'], ['#coolant kbd', 'V', 'B / ○']] as const;
		for (const [selector, keyboard, gamepad] of prompts) {
			const prompt = container.querySelector(selector); if (prompt) prompt.textContent = value === 'gamepad' ? gamepad : keyboard;
		}
		element('weapon-hint').textContent = value === 'gamepad' ? 'HOLD TRIGGERS + BUMPERS' : value === 'touch' ? 'HOLD TOGETHER TO COMBINE' : 'HOLD MOUSE BUTTONS / 1–4';
		element('menu-input-hint').textContent = value === 'gamepad' ? 'A / × SELECT · B / ○ BACK · RIGHT STICK SCROLL' : value === 'touch' ? 'TAP TO SELECT · SWIPE TO SCROLL' : 'TAB SELECT · ENTER CONFIRM · ESC BACK';
	};
	const save = function () {
		element('storage-status').textContent = saveProfile(profile) ? 'Preferences and operation records are saved on this device.' : 'Device storage is unavailable. You can keep playing; records will last for this session.';
	};
	const updateSettings = function () {
		audio.setMix(profile.settings);
		container.classList.toggle('reduced-motion', motionReduced());
		container.classList.toggle('touch-enabled', coarsePointer.matches || profile.settings.touchControls);
		for (const name of ['master', 'music', 'effects'] as const) {
			inputElement(`${name}-volume`).value = String(Math.round(profile.settings[name] * 100));
			element(`${name}-output`).textContent = `${Math.round(profile.settings[name] * 100)}%`;
		}
		inputElement('reduce-motion').checked = profile.settings.reducedMotion;
		inputElement('show-touch').checked = profile.settings.touchControls;
		inputElement('large-interface').checked = profile.settings.couchUI;
		inputElement('controller-vibration').checked = profile.settings.vibration;
		setInputMode(inputMode);
	};
	const menu = function () { return auxiliary ? element(auxiliary) : screen === 'playing' ? undefined : element(screen); };
	const focusable = function (root: HTMLElement) {
		return [...root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')].filter(function (item) { return !item.closest('[hidden], [inert]'); });
	};
	const syncScreen = function (focus = true) {
		screenRevision++;
		element('reset').textContent = training ? 'RESTART TRAINING' : state.mission ? 'RELAUNCH SORTIE' : 'RESTART OPERATION';
		element('leave').textContent = state.mission ? 'ABORT CONTRACT & RETURN TO SHIP' : campaignMode ? 'RETURN TO SHIP' : 'RETURN TO BRIEFING';
		element('loadout-back').textContent = campaignMode ? '← BACK TO SHIP' : '← BACK TO BRIEFING';
		element('training-deploy').textContent = campaignMode ? campaign.active ? 'CHOOSE CONTRACT FRAME →' : 'RETURN TO SHIP →' : 'CHOOSE OPERATION FRAME →';
		element('training-briefing').textContent = campaignMode ? 'RETURN TO SHIP' : 'RETURN TO BRIEFING';
		element('pause-copy').textContent = training ? 'Training is paused. Resume the drill or return to the briefing.' : 'Your throttle and operation are preserved.';
		for (const id of ['bridge', 'jump', 'brief', 'pause-panel', 'refit', 'result', 'training-result', 'settings', 'handbook', 'confirm', 'loadout', 'requisition']) {
			const node = element(id); const visible = auxiliary ? id === auxiliary : id === screen;
			node.hidden = !visible; node.inert = !visible;
		}
		const modal = screen !== 'playing' || Boolean(auxiliary);
		container.classList.toggle('training-active', Boolean(training));
		container.classList.toggle('menu-open', modal); container.dataset['screen'] = auxiliary ?? screen;
		element('hud').inert = modal; canvas.inert = modal;
		resetInput(); accumulator = 0; lastHud = 0;
		if (!focus) return;
		const root = menu();
		const initial = auxiliary === 'settings' ? element('master-volume') : auxiliary === 'handbook' ? element('handbook') : auxiliary === 'confirm' ? element('confirm-cancel') : screen === 'bridge' ? element('bridge') : screen === 'brief' ? element('start') : screen === 'pause-panel' ? element('resume') : screen === 'result' ? element('restart') : root?.querySelector<HTMLElement>('button');
		if (root) (root.querySelector<HTMLElement>('.frame-list') ?? root).scrollTop = 0;
		(initial ?? canvas).focus({ preventScroll: true });
		if (initial && auxiliary !== 'handbook') initial.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	};
	const updateRecordSummary = function () {
		const records = profile.bests.filter(function (record) { return record.difficulty === profile.settings.difficulty; });
		const best = [...records].sort(function (a, b) { return b.score - a.score; })[0];
		element('record-summary').textContent = best ? `${profile.settings.difficulty.toUpperCase()} BEST · ${best.score.toLocaleString()} · RANK ${best.rank} · ${best.won ? 'SIGNAL HELD' : `ASSAULT ${best.wave}/5`}` : 'NO OPERATIONS RECORDED';
		for (const input of container.querySelectorAll<HTMLInputElement>('input[data-difficulty]')) input.checked = input.value === profile.settings.difficulty;
		element('difficulty-copy').textContent = DIFFICULTIES.find(function (difficulty) { return difficulty.id === profile.settings.difficulty; })?.description ?? '';
	};
	const start = function () {
		if (contextLost) return;
		if (campaignMode && !campaign.active) { toBridge(); return; }
		presentation.resetZoom();
		training = undefined;
		state = campaignMode && campaign.active ? createMissionState(campaign.active, { difficulty: profile.settings.difficulty, frame: selectedFrame }) : createState({ difficulty: profile.settings.difficulty, frame: selectedFrame, seed: crypto.getRandomValues(new Uint32Array(1))[0] ?? 1 }); gaits = createGaits(state); screen = 'playing'; auxiliary = undefined;
		aim = state.mission ? { ...state.mission.map.objective } : { x: 900, y: 450 }; pointer = undefined; message = state.mission ? `${getFrame(selectedFrame).name.toUpperCase()} ON SURFACE · ${MISSION_NAMES[state.mission.contract.kind].toUpperCase()}` : `${getFrame(selectedFrame).name} ONLINE. PROTECT RELAY 09.`; messageUntil = 5; tipDismissed = false;
		terminalUntil = 0; audio.reset(); syncScreen(); unlockSound();
	};
	const startTraining = function () {
		if (contextLost) return;
		presentation.resetZoom();
		training = createTraining(); state = training.state; gaits = createGaits(state);
		screen = 'playing'; auxiliary = undefined; pointer = undefined; aim = { x: 900, y: 450 };
		message = ''; messageUntil = 0; tipDismissed = true; terminalUntil = 0;
		audio.reset(); syncScreen(); unlockSound();
	};
	const toBriefing = function () {
		if (campaignMode) { toBridge(); return; }
		presentation.resetZoom();
		training = undefined;
		screen = 'brief'; auxiliary = undefined; state = createState({ difficulty: profile.settings.difficulty, frame: selectedFrame }); gaits = createGaits(state);
		aim = { x: 900, y: 450 }; pointer = undefined; audio.reset(); updateRecordSummary(); syncScreen();
	};
	const setPaused = function (paused: boolean) {
		if (paused) silenceAudio();
		if (paused && screen === 'playing') { screen = 'pause-panel'; auxiliary = undefined; syncScreen(); }
		else if (!paused && screen === 'pause-panel' && !contextLost) { screen = 'playing'; auxiliary = undefined; syncScreen(); unlockSound(); }
	};
	const showAuxiliary = function (value: Auxiliary) {
		if (document.activeElement instanceof HTMLElement) returnFocus = document.activeElement;
		auxiliary = value; syncScreen();
	};
	const closeAuxiliary = function () {
		auxiliary = undefined; confirmedAction = undefined; syncScreen(false);
		if (returnFocus?.isConnected && !returnFocus.closest('[hidden], [inert]')) returnFocus.focus({ preventScroll: true });
		else syncScreen();
	};
	const confirm = function (action: () => void, label: string, copy = 'The current operation will be lost. Your recorded results and settings will be kept.', title = 'ABANDON THIS RUN?') {
		confirmedAction = action; element('confirm-action').textContent = label; element('confirm-copy').textContent = copy; element('confirm-title').textContent = title; showAuxiliary('confirm');
	};
	const persistCampaign = function () { campaignSaved = saveCampaign(campaign); };
	const refreshBridge = function () {
		renderBridge(element('bridge'), campaign, destination, selectedContract, campaignSaved, {
			selectPlanet: function (id) { if (campaign.active) return; destination = id; selectedContract = undefined; refreshBridge(); },
			selectContract: function (id) { selectedContract = id; refreshBridge(); },
			travel: function () {
				if (screen !== 'bridge' || auxiliary || contextLost) return;
				const origin = getPlanet(campaign.planetId); const next = travelTo(campaign, destination); if (next === campaign) return;
				campaign = next; persistCampaign();
				element('jump-destination').textContent = getPlanet(campaign.planetId).name.toUpperCase();
				element('jump-copy').textContent = `${origin.name} → ${getPlanet(campaign.planetId).name} · DAY ${campaign.day} · APPROACHING ORBIT`;
				screen = 'jump'; jumpUntil = performance.now() + (motionReduced() ? 350 : 2200); syncScreen();
				element('jump').focus({ preventScroll: true });
			},
			accept: function (contract) {
				if (screen !== 'bridge' || auxiliary || destination !== campaign.planetId) return;
				const next = acceptContract(campaign, contract.id); if (next === campaign) return;
				campaign = next; persistCampaign(); refreshBridge(); syncScreen();
				element('bridge-deploy').focus({ preventScroll: true }); element('bridge-deploy').scrollIntoView({ block: 'nearest' });
			},
			deploy: openLoadout,
			abandon: function () { confirm(function () { campaign = abandonContract(campaign); persistCampaign(); toBridge(); }, 'ABORT & RETURN TO SHIP', 'No payment or employer favor will be earned. The opposition reputation penalty from acceptance remains.', 'ABORT THIS CONTRACT?'); },
			training: startTraining,
			legacy: function () { campaignMode = false; toBriefing(); },
			settings: function () { showAuxiliary('settings'); },
			handbook: function () { showAuxiliary('handbook'); },
		});
	};
	const toBridge = function () {
		campaignMode = true; training = undefined; screen = 'bridge'; auxiliary = undefined; destination = campaign.planetId; selectedContract = undefined;
		state = createState({ difficulty: profile.settings.difficulty, frame: selectedFrame }); gaits = createGaits(state);
		pointer = undefined; presentation.resetZoom(); audio.reset(); refreshBridge(); syncScreen();
	};
	const frameCards = FRAMES.map(function (definition) {
		return frameCard(definition, function () {
			if (screen !== 'loadout' || auxiliary) return;
			selectedFrame = definition.id;
			state = createState({ difficulty: profile.settings.difficulty, frame: selectedFrame }); gaits = createGaits(state);
			updateFrame();
		});
	});
	const updateFrame = function () {
		const definition = getFrame(selectedFrame);
		for (const card of frameCards) {
			const selected = card.dataset['frame'] === selectedFrame;
			card.setAttribute('aria-pressed', String(selected));
			const badge = card.querySelector('.frame-badge'); if (badge) badge.textContent = selected ? '✓ SELECTED FRAME' : 'SELECT FRAME';
		}
		element('frame-summary').textContent = `${definition.name} + ${getWeapon(definition.starter).name}`;
		element('frame-dossier-name').textContent = `${definition.name} / ${definition.designation}`;
		element('frame-dossier-role').textContent = `${definition.mass}T ${definition.role.toUpperCase()}`;
		element('hangar-frame-name').textContent = `${definition.name} / ${definition.designation}`;
		element('hangar-frame-role').textContent = definition.role.toUpperCase();
		element('hangar-preview').style.setProperty('--frame-color', definition.color);
	};
	element('frame-cards').replaceChildren(...frameCards); updateFrame();
	const openLoadout = function () {
		if (campaignMode && !campaign.active) { toBridge(); return; }
		presentation.resetZoom();
		state = createState({ difficulty: profile.settings.difficulty, frame: selectedFrame }); gaits = createGaits(state);
		screen = 'loadout'; auxiliary = undefined; training = undefined; syncScreen();
		const selected = frameCards.find(function (card) { return card.dataset['frame'] === selectedFrame; });
		selected?.focus({ preventScroll: true }); selected?.scrollIntoView({ block: 'nearest' });
	};
	const finishDraft = function (id: WeaponId, slot?: number) {
		if (screen !== 'requisition' || auxiliary || contextLost || !chooseWeapon(state, id, slot)) return;
		if (state.phase === 'requisition') { showDraft(); return; }
		screen = 'playing'; message = `${getWeapon(id).name.toUpperCase()} ONLINE · HOLD MULTIPLE MOUNTS TO COMBINE FIRE`; messageUntil = state.time + 4;
		syncScreen(); unlockSound();
	};
	const showDraft = function () {
		screen = 'requisition';
		element('draft-number').textContent = `DROP ${state.draftCount + 1} / ${DRAFT_MILESTONES.length}`;
		element('draft-copy').textContent = state.loadout.length < 4 ? `Choose a weapon for mount ${state.loadout.length + 1}. Combat is paused, including incoming artillery.` : 'Upgrade an installed weapon (+30% base damage per rank), or choose a new weapon and replace a mount. Combat is paused.';
		element('replace-panel').hidden = true; element('draft-cards').hidden = false;
		element('draft-loadout').replaceChildren(...mountSummary(state.loadout));
		element('draft-cards').replaceChildren(...state.offers.map(function (id) {
			const owned = state.loadout.find(function (mount) { return mount.weapon === id; });
			const badge = owned ? `UPGRADE ${rankLabel(owned.level)} → ${rankLabel(owned.level + 1)} · +30% BASE DAMAGE` : state.loadout.length < 4 ? `INSTALL IN MOUNT ${state.loadout.length + 1}` : 'NEW WEAPON · CHOOSE MOUNT';
			return weaponCard(id, badge, function () {
				if (owned || state.loadout.length < 4) { finishDraft(id); return; }
				element('replace-title').textContent = `INSTALL ${getWeapon(id).name.toUpperCase()} · REPLACE WHICH MOUNT?`;
				element('replace-cards').replaceChildren(...mountSummary(state.loadout, function (slot) { finishDraft(id, slot); }));
				element('draft-cards').hidden = true; element('replace-panel').hidden = false;
				element('replace-cards').querySelector('button')?.focus();
			});
		}));
		syncScreen();
	};
	const listen = function (id: string, callback: () => void) { element(id).addEventListener('click', callback, listenerOptions); };
	listen('deploy-loadout', start); listen('loadout-back', toBriefing); listen('replace-back', showDraft);
	listen('training', startTraining); listen('training-deploy', openLoadout); listen('training-briefing', toBriefing);
	listen('start', openLoadout); listen('restart', function () { if (campaignMode) toBridge(); else openLoadout(); });
	listen('brief-bridge', toBridge); listen('resume', function () { setPaused(false); });
	listen('pause', function () { setPaused(true); });
	listen('reset', function () { if (state.mission) confirm(openLoadout, 'RELAUNCH SORTIE', 'Return to the frame bay and relaunch this accepted contract. Surface progress resets; the original acceptance penalty is retained without a second charge.', 'RELAUNCH THIS SORTIE?'); else confirm(training ? startTraining : openLoadout, training ? 'RESTART TRAINING' : 'RESTART OPERATION'); });
	listen('leave', function () { if (state.mission) confirm(function () { campaign = abandonContract(campaign); persistCampaign(); toBridge(); }, 'ABORT & RETURN TO SHIP', 'No payment or employer favor will be earned. The opposition reputation penalty from acceptance remains.', 'ABORT THIS CONTRACT?'); else confirm(toBriefing, campaignMode ? 'RETURN TO SHIP' : 'RETURN TO BRIEFING'); });
	listen('result-briefing', toBriefing);
	listen('confirm-action', function () { const action = confirmedAction; confirmedAction = undefined; action?.(); });
	listen('confirm-cancel', closeAuxiliary);
	for (const id of ['brief-settings', 'pause-settings']) listen(id, function () { showAuxiliary('settings'); });
	for (const id of ['brief-controls', 'pause-controls']) listen(id, function () { showAuxiliary('handbook'); });
	listen('close-settings', closeAuxiliary); listen('close-handbook', closeAuxiliary);
	listen('dismiss-hint', function () { tipDismissed = true; ui.hint.hidden = true; canvas.focus({ preventScroll: true }); });
	listen('sound', function () {
		if (audio.status() !== 'running') { muted = false; audio.setMuted(false); unlockSound(); }
		else { muted = !muted; audio.setMuted(muted); }
		canvas.focus({ preventScroll: true });
	});
	for (const input of container.querySelectorAll<HTMLInputElement>('input[data-difficulty]')) input.addEventListener('change', function () {
		if (!isDifficulty(input.value)) return;
		profile.settings.difficulty = input.value; save(); updateRecordSummary();
	}, listenerOptions);
	for (const name of ['master', 'music', 'effects'] as const) inputElement(`${name}-volume`).addEventListener('input', function () {
		profile.settings[name] = Number(inputElement(`${name}-volume`).value) / 100; updateSettings(); save(); unlockSound();
	}, listenerOptions);
	inputElement('reduce-motion').addEventListener('change', function () { profile.settings.reducedMotion = inputElement('reduce-motion').checked; updateSettings(); save(); }, listenerOptions);
	inputElement('show-touch').addEventListener('change', function () { profile.settings.touchControls = inputElement('show-touch').checked; updateSettings(); save(); }, listenerOptions);
	inputElement('large-interface').addEventListener('change', function () { profile.settings.couchUI = inputElement('large-interface').checked; updateSettings(); save(); }, listenerOptions);
	inputElement('controller-vibration').addEventListener('change', function () { profile.settings.vibration = inputElement('controller-vibration').checked; updateSettings(); save(); if (!profile.settings.vibration) void feedback.stop(); }, listenerOptions);
	element('handbook').tabIndex = -1;
	reducedMotion.addEventListener('change', updateSettings, listenerOptions); coarsePointer.addEventListener('change', updateSettings, listenerOptions);
	const refitButtons = REFITS.map(function (refit, index) {
		const button = document.createElement('button'); button.className = 'refit-card'; button.dataset['refit'] = refit.id;
		const symbol = document.createElement('span'); symbol.className = 'refit-symbol'; symbol.setAttribute('aria-hidden', 'true'); symbol.textContent = ['╋', '❄', '◈'][index] ?? '+';
		const title = document.createElement('b'); title.textContent = refit.name.toUpperCase();
		const description = document.createElement('p'); description.textContent = `${refit.label}. ${refit.description}`;
		const count = document.createElement('small');
		button.append(symbol, title, description, count);
		button.addEventListener('click', function () {
			if (screen !== 'refit' || auxiliary || contextLost || !applyRefit(state, refit.id)) return;
			screen = 'playing'; gaits = createGaits(state); message = `${getWaveDefinition(state.wave).name.toUpperCase()} / ${refit.name.toUpperCase()} INSTALLED`; messageUntil = state.time + 5;
			syncScreen(); unlockSound(); audio.play(state.events);
		}, listenerOptions);
		return { button, count, choice: refit.id };
	});
	element('refit-cards').replaceChildren(...refitButtons.map(function (entry) { return entry.button; }));
	const showRefit = function () {
		screen = 'refit';
		element('refit-phase').textContent = `ASSAULT ${state.wave} / ${WAVES.length} COMPLETE`;
		element('refit-copy').textContent = `The yard is quiet. Field service restores 25 frame integrity, purges heat, and adds one coolant charge. Choose an upgrade for the rest of this operation.`;
		element('refit-next').textContent = `NEXT: ${getWaveDefinition(state.wave + 1).name.toUpperCase()} — ${getWaveDefinition(state.wave + 1).briefing}`;
		for (const entry of refitButtons) entry.count.textContent = `INSTALLED ${state.upgrades[entry.choice]} · SELECT TO REFIT →`;
		syncScreen();
	};
	const showResult = function (now: number) {
		if (training) return;
		const report = getOperationReport(state); const won = state.outcome === 'won';
		screen = 'result'; terminalUntil = now + 1600;
		element('result-title').textContent = won ? 'SIGNAL UNBROKEN.' : 'SIGNAL LOST.';
		element('result-copy').textContent = won ? 'The command frame is down. The last evacuation has cleared the line. Relay 09 is still transmitting.' : state.player.hp <= 0 ? `${getFrame(state.frame).name} has fallen. Keep moving through artillery markers, recover salvage, and give the reactor time to cool.` : 'Relay 09 is silent. Intercept siege frames early; their artillery can reach the uplink from outside the yard.';
		element('result-difficulty').textContent = `${getFrame(state.frame).name} · ${state.difficulty.toUpperCase()}`;
		element('result-rank').textContent = report.rank; element('result-score').textContent = report.score.toLocaleString();
		const stats = [[`${report.kills}/${TOTAL_HOSTILES}`, 'HOSTILES'], [formatTime(report.time), 'FIELD TIME'], [`${Math.ceil(report.relay)}%`, 'RELAY'], [`${report.accuracy}%`, 'BALLISTIC HITS']];
		element('result-stats').replaceChildren(...stats.map(function ([value, label]) { const node = document.createElement('div'); const strong = document.createElement('b'); const small = document.createElement('small'); strong.textContent = value ?? ''; small.textContent = label ?? ''; node.append(strong, small); return node; }));
		element('result-upgrades').textContent = `LOADOUT · ${state.loadout.map(function (mount) { return `${getWeapon(mount.weapon).name} ${rankLabel(mount.level)}`; }).join(' / ')} · REFITS · ARSENAL ${state.upgrades.arsenal} / COOLING ${state.upgrades.cooling} / BASTION ${state.upgrades.bastion}`;
		element('restart').textContent = state.mission ? 'RETURN TO SHIP →' : 'DEPLOY AGAIN ↗';
		element('result-briefing').hidden = Boolean(state.mission);
		if (state.mission) {
			const contract = state.mission.contract;
			campaign = settleContract(campaign, won); persistCampaign();
			element('result-title').textContent = won ? 'CONTRACT COMPLETE.' : 'CONTRACT FAILED.';
			element('result-copy').textContent = won ? `${getPlanet(contract.planetId).name} extraction complete. ${getFaction(contract.employer).name} has confirmed the objective and released payment.` : `The sortie was lost. No payment or employer favor was earned. The acceptance penalty with ${getFaction(contract.opponent).name} remains.`;
			element('result-score').textContent = `${campaign.lastResult?.payout.toLocaleString() ?? '0'} CR`;
			element('result-rank').textContent = won ? '✓' : '×';
			const heading = element('result-score').previousElementSibling; if (heading) heading.textContent = 'CONTRACT PAYMENT';
			const missionStats = [[String(report.kills), 'ELIMINATED'], [formatTime(report.time), 'FIELD TIME'], [`${report.armor}%`, 'FRAME INTEGRITY'], [`+${campaign.lastResult?.favor ?? 0}`, 'EMPLOYER FAVOR']];
			element('result-stats').replaceChildren(...missionStats.map(function ([value, label]) { const node = document.createElement('div'); const strong = document.createElement('b'); const small = document.createElement('small'); strong.textContent = value ?? ''; small.textContent = label ?? ''; node.append(strong, small); return node; }));
			element('result-upgrades').textContent = `OPPOSITION · ${getFaction(contract.opponent).name}: −${contract.hostility} applied on acceptance. Current standing: ${campaign.reputation[contract.opponent]}.`;
			element('record-feedback').textContent = campaignSaved ? 'CAMPAIGN SAVED ON THIS DEVICE' : 'STORAGE UNAVAILABLE · CAMPAIGN CONTINUES FOR THIS SESSION';
			syncScreen(); return;
		}
		const scoreHeading = element('result-score').previousElementSibling; if (scoreHeading) scoreHeading.textContent = 'OPERATION SCORE';
		const oldBest = Math.max(0, ...profile.bests.filter(function (record) { return record.difficulty === state.difficulty; }).map(function (record) { return record.score; }));
		profile = addOperationRecord(profile, { difficulty: state.difficulty, won, score: report.score, rank: report.rank, kills: report.kills, wave: state.wave, time: report.time, relay: report.relay });
		const saved = saveProfile(profile);
		element('record-feedback').textContent = !saved ? 'Device storage is unavailable. This report is kept for this session.' : report.score > oldBest ? `NEW ${state.difficulty.toUpperCase()} RECORD · SAVED ON THIS DEVICE` : 'OPERATION RECORDED ON THIS DEVICE';
		syncScreen();
	};
	window.addEventListener('keydown', function (event) {
		setInputMode('keyboard'); if (event.isTrusted) unlockSound();
		if (event.code === 'Escape') { event.preventDefault(); if (event.repeat) return; if (auxiliary) closeAuxiliary(); else if (screen === 'loadout') toBriefing(); else if (screen === 'requisition' && !element('replace-panel').hidden) showDraft(); else setPaused(screen === 'playing'); return; }
		const root = menu();
		// Every paused choice needs a fresh confirmation, even when multi-kills
		// queue several drafts and the next card receives focus immediately.
		if (root && event.repeat && (event.code === 'Enter' || event.code === 'Space')) { event.preventDefault(); return; }
		if (root && event.code === 'Tab') {
			const items = focusable(root); const first = items[0]; const last = items.at(-1);
			if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
			else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
			return;
		}
		if (!playing()) return;
		if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement) return;
		const action = bindings.get(event.code); if (!action) return;
		event.preventDefault(); if (event.repeat && !keys.has(event.code)) return; keys.add(event.code); if (!event.repeat) pending.add(action);
	}, listenerOptions);
	window.addEventListener('keyup', function (event) { const action = bindings.get(event.code); if (action) keys.delete(event.code); }, listenerOptions);
	container.addEventListener('pointerdown', function (event) { setInputMode(event.pointerType === 'touch' ? 'touch' : 'keyboard'); if (event.isTrusted) unlockSound(); }, listenerOptions);
	container.addEventListener('click', function (event) {
		if (!(event.target instanceof Element) || !event.target.closest('button') || !menu()) return;
		audio.cue(event.target.closest('#close-settings, #close-handbook, #confirm-cancel') ? 'back' : 'confirm');
	}, { ...listenerOptions, capture: true });
	window.addEventListener('blur', function () { focused = false; padInput.suspend(); resetInput(); setPaused(true); }, listenerOptions);
	window.addEventListener('focus', function () { focused = true; padInput.suspend(); }, listenerOptions);
	document.addEventListener('visibilitychange', function () { padInput.suspend(); if (document.hidden) { silenceAudio(); resetInput(); setPaused(true); } }, listenerOptions);
	canvas.addEventListener('webglcontextlost', function (event) {
		event.preventDefault(); contextLost = true; padInput.suspend(); resetInput(); setPaused(true);
		const error = element('error'); error.textContent = 'Graphics interrupted. Waiting for recovery…'; error.hidden = false;
	}, listenerOptions);
	canvas.addEventListener('webglcontextrestored', function () { contextLost = false; padInput.suspend(); element('error').hidden = true; accumulator = 0; previous = 0; }, listenerOptions);
	const updatePointer = function (event: PointerEvent) {
		if (!playing()) return;
		const rect = canvas.getBoundingClientRect(); pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }; aimMode = 'pointer';
		setInputMode(event.pointerType === 'touch' ? 'touch' : 'keyboard');
	};
	canvas.addEventListener('pointermove', updatePointer, listenerOptions);
	canvas.addEventListener('wheel', function (event) {
		if (!playing() || event.ctrlKey || event.metaKey) return;
		event.preventDefault(); presentation.zoomWithWheel(event); setInputMode('keyboard');
	}, { ...listenerOptions, passive: false });
	canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); }, listenerOptions);
	canvas.addEventListener('auxclick', function (event) { event.preventDefault(); }, listenerOptions);
	canvas.addEventListener('pointerdown', function (event) {
		if (!playing()) return;
		updatePointer(event); canvas.focus({ preventScroll: true });
		if (event.pointerType === 'touch') canvas.setPointerCapture(event.pointerId);
	}, listenerOptions);
	// Pointerdown only fires for the first mouse button in a chord. Mouse events
	// report every press/release, so all four mounts remain independent.
	canvas.addEventListener('mousedown', function (event) {
		const binding = MOUNTS.find(function (mount) { return mount.button === event.button; });
		if (!binding || !playing()) return;
		event.preventDefault(); mouseButtons.add(event.button); consumedMouseButtons.add(event.button); pending.add(binding.action);
	}, listenerOptions);
	window.addEventListener('mouseup', function (event) {
		// Chromium handles side-button history on mouseup, before auxclick.
		if (consumedMouseButtons.has(event.button) || event.target === canvas) event.preventDefault();
		mouseButtons.delete(event.button); consumedMouseButtons.delete(event.button);
	}, listenerOptions);
	const release = function (event: PointerEvent) { held.delete(event.pointerId); if (event.type === 'pointercancel') mouseButtons.clear(); };
	window.addEventListener('pointerup', release, listenerOptions); window.addEventListener('pointercancel', release, listenerOptions);
	for (const button of container.querySelectorAll<HTMLButtonElement>('[data-control]')) {
		const action = button.dataset['control']; if (!action) continue;
		button.addEventListener('pointerdown', function (event) {
			if (!playing() || event.button !== 0) return;
			event.preventDefault(); button.setPointerCapture(event.pointerId); held.set(event.pointerId, action); pending.add(action);
		}, listenerOptions);
		button.addEventListener('click', function (event) { if (event.detail === 0 && playing()) { pending.add(action); canvas.focus({ preventScroll: true }); } }, listenerOptions);
		button.addEventListener('lostpointercapture', release, listenerOptions);
	}
	const updateHud = function () {
		hudObstructions = cockpitElements.filter(function (node) { return node.offsetWidth > 0; }).map(function (node) { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; });
		const p = state.player;
		ui.phase.textContent = `${String(state.wave).padStart(2, '0')} / ${getWaveDefinition(state.wave).name.toUpperCase()}`;
		ui.status.textContent = state.intermission > 0 ? 'ASSAULT CLEAR · SECURING THE YARD' : `${state.enemies.length} ACTIVE · ${state.warnings.length} INBOUND · ${state.kills}/${TOTAL_HOSTILES} ELIMINATED`;
		element('mission-name').textContent = state.mission ? `${getPlanet(state.mission.contract.planetId).name.toUpperCase()} / ${getFaction(state.mission.contract.employer).shortName}` : 'LAST TRANSMISSION';
		element('relay-readout').hidden = Boolean(state.mission && state.mission.contract.kind !== 'defend');
		element('relay-name').textContent = state.mission ? 'CONTRACT RELAY' : 'RELAY 09';
		if (state.mission) { ui.phase.textContent = state.mission.stage === 'extract' ? 'OBJECTIVE COMPLETE / EXTRACT' : MISSION_NAMES[state.mission.contract.kind].toUpperCase(); ui.status.textContent = missionObjective(state); }
		element('training-guide').hidden = !training || screen !== 'playing';
		if (training) {
			const copy = trainingCopy(training, inputMode === 'gamepad');
			container.dataset['trainingStage'] = training.stage;
			ui.phase.textContent = 'WARDEN QUALIFICATION'; ui.status.textContent = 'STANDARD TRAINING FRAME · NO SCORED RECORD';
			element('training-progress').textContent = `DRILL ${copy.progress}`;
			element('training-title').textContent = copy.title;
			element('training-copy').textContent = inputMode === 'gamepad' && currentPad?.connected && !currentPad.ready ? 'Release sticks and triggers to arm the controls, then follow the drill.' : copy.instruction;
		} else delete container.dataset['trainingStage'];
		ui.armor.textContent = `${Math.max(0, Math.ceil(p.hp))}%`; ui.armorFill.style.width = `${Math.max(0, p.hp)}%`; ui.armorFill.style.background = p.hp < 30 ? 'var(--danger)' : 'var(--cyan)';
		ui.relay.textContent = `${Math.max(0, Math.ceil(state.relay))}%`; ui.relayFill.style.width = `${Math.max(0, state.relay)}%`; ui.relayFill.style.background = state.relay < 30 ? 'var(--danger)' : 'var(--cyan)';
		ui.heat.textContent = p.overheated ? 'LOCKOUT' : `${Math.ceil(p.heat)}%`; ui.heatFill.style.width = `${p.heat}%`; ui.heatFill.style.background = p.heat > 80 ? 'var(--danger)' : 'var(--amber)';
		ui.drive.textContent = `${p.throttle < -0.005 ? 'REV' : p.throttle > 0.005 ? 'FWD' : 'N'} ${Math.round(Math.abs(p.throttle) * 100)}%`;
		const definition = getFrame(state.frame);
		ui.throttleFill.style.left = `${p.throttle < 0 ? 50 + p.throttle * 50 : 50}%`; ui.throttleFill.style.width = `${Math.abs(p.throttle) * 50}%`; ui.speed.textContent = `SPD ${Math.round(p.speed / (p.speed < 0 ? definition.reverseSpeed : definition.speed) * 100)}%`;
		for (const [index, button] of weaponButtons.entries()) {
			const mount = state.loadout[index]; const binding = MOUNTS[index]; if (!binding) continue;
			const weapon = mount ? getWeapon(mount.weapon) : undefined;
			const drillSlot = training?.stage === 'cannon' ? 0 : training?.stage === 'missiles' ? 2 : training?.stage === 'heat' ? 1 : -1;
			button.disabled = !mount || Boolean(training && training.stage !== 'combined' && index !== drillSlot);
			const firing = Boolean(mount && !button.disabled && !p.overheated && playing() && (mount.firing || active(binding.action) || currentPad?.fire[index]));
			button.classList.toggle('empty', !mount); button.classList.toggle('firing', firing); button.classList.toggle('locked', p.overheated);
			button.setAttribute('aria-label', mount && weapon ? `Fire mount ${index + 1}: ${weapon.name}, rank ${rankLabel(mount.level)}. ${binding.mouse} mouse or hold ${binding.key}; controller ${binding.pad}.` : `Mount ${index + 1} empty. Earn weapons from eliminations.`);
			const title = button.querySelector('b'); if (title) title.textContent = mount && weapon ? weapon.name : 'EMPTY';
			const icon = button.querySelector('.weapon-icon'); if (icon) icon.textContent = `${String(index + 1).padStart(2, '0')}${mount ? ` · ${rankLabel(mount.level)}` : ''}`;
			const prompt = button.querySelector('kbd'); if (prompt) prompt.textContent = inputMode === 'gamepad' ? binding.pad : inputMode === 'touch' ? `HOLD ${index + 1}` : `${binding.mouse} / ${binding.key}`;
			const label = button.querySelector('em'); if (label) label.textContent = !mount ? 'EARN A DROP' : button.disabled ? 'DRILL LOCK' : p.overheated ? 'HEAT LOCK' : firing ? 'FIRING' : mount.cooldown > 0 ? `${mount.cooldown.toFixed(1)}s` : 'READY';
			const fill = button.querySelector('i'); if (fill) fill.style.width = `${mount && weapon ? Math.max(0, 1 - mount.cooldown / Math.max(.01, weapon.interval)) * 100 : 0}%`;
			button.style.setProperty('--weapon-color', weapon?.color ?? 'var(--muted)');
		}
		const threshold = DRAFT_MILESTONES[state.draftCount]; const lastThreshold = DRAFT_MILESTONES[state.draftCount - 1] ?? 0;
		element('draft-progress-label').textContent = threshold ? `NEXT DROP · ${state.kills} / ${threshold} ELIMINATIONS` : 'ALL DROPS RECOVERED';
		element('draft-progress-fill').style.width = `${threshold ? Math.min(100, (state.kills - lastThreshold) / (threshold - lastThreshold) * 100) : 100}%`;
		element('coolant').toggleAttribute('disabled', Boolean(training && training.stage !== 'coolant'));
		ui.coolant.textContent = `${state.coolantCharges} ${state.coolantCharges === 1 ? 'CHARGE' : 'CHARGES'}`;
		ui.message.textContent = !playing() ? '' : inputMode === 'gamepad' && currentPad?.connected && !currentPad.ready ? 'RELEASE STICKS AND TRIGGERS TO ARM CONTROLS' : p.overheated ? 'REACTOR LOCKOUT / VENT COOLANT OR CEASE FIRE' : state.time < messageUntil ? message : state.relay < 30 ? 'RELAY INTEGRITY CRITICAL' : '';
		ui.hint.hidden = tipDismissed || state.time > 35 || screen !== 'playing';
		ui.hintCopy.textContent = inputMode === 'gamepad' ? 'Left stick sets throttle; X / □ stops. Right stick aims. RT / LT / RB / LB combine fire; B / ○ vents.' : inputMode === 'touch' || coarsePointer.matches || profile.settings.touchControls ? 'Tap the field to aim. Hold + to move; STOP sets neutral. Hold a weapon to fire.' : state.time < 14 ? 'W / S set throttle. Release to cruise. X sets neutral; A / D steer.' : 'Hold left / right / middle / thumb to combine mounts. Hold 1–4 also fires. V vents coolant.';
		const audioState = audio.status(); const needsGesture = audioState === 'locked' || audioState === 'pending';
		const soundState = audioState === 'unavailable' ? 'UNAVAILABLE' : needsGesture ? 'ENABLE SOUND' : muted ? 'SOUND OFF' : 'SOUND ON';
		if (lastSoundState !== soundState) { lastSoundState = soundState; ui.sound.textContent = soundState; ui.sound.setAttribute('aria-label', needsGesture ? 'Click to enable audio' : audioState === 'unavailable' ? 'Retry audio' : muted ? 'Unmute sound' : 'Mute sound'); ui.sound.setAttribute('aria-pressed', String(muted)); }
		const audioStatus = needsGesture && inputMode === 'gamepad' ? 'Audio needs a click or key press in this browser.' : audioState === 'unavailable' ? 'Audio device unavailable. Click or press a key to retry.' : '';
		if (element('audio-status').textContent !== audioStatus) element('audio-status').textContent = audioStatus;
	};
	const audioFrame = function (now: number) {
		const combat = playing(); const audibleMenu = screen === 'jump' || screen === 'bridge' || screen === 'brief' || screen === 'loadout' || screen === 'requisition' || screen === 'refit' || screen === 'training-result' || (screen === 'result' && now < terminalUntil + 30000);
		return { speed: combat ? state.player.speed : 0, laser: combat && !!state.beam, heat: state.player.heat,
			active: !contextLost && focused && !document.hidden && (combat || audibleMenu), uiActive: !contextLost && focused && !document.hidden,
			phase: screen === 'jump' || screen === 'bridge' || screen === 'brief' || screen === 'loadout' ? 'briefing' as const : screen === 'refit' || screen === 'requisition' || screen === 'training-result' ? 'refit' as const : screen === 'result' ? 'result' as const : 'combat' as const,
			intensity: Math.min(1, state.enemies.length / 5 + (state.wave - 1) * 0.08), danger: Math.max(0, 1 - Math.min(state.player.hp, state.relay) / 50), victory: state.outcome === 'won' };
	};
	const tick = function (now: number) {
		if (screen === 'jump' && focused && !document.hidden && now >= jumpUntil) toBridge();
		const revisionAtFrame = screenRevision;
		const elapsed = previous ? Math.min((now - previous) / 1000, 0.1) : 0; previous = now;
		const rect = canvas.getBoundingClientRect(); const width = rect.width; const height = rect.height;
		presentation.resize(state, width, height, motionReduced());
		let pads: readonly (Gamepad | null)[] = [];
		try { pads = navigator.getGamepads?.() ?? []; } catch { /* Gamepad access can be restricted by an embedding policy. */ }
		if (!focused || document.hidden || contextLost) padInput.suspend();
		const pad = padInput.read(pads, now);
		currentPad = pad;
		if (pad.lost) { controllerLost = true; setPaused(true); }
		feedback.update(pads.find(function (candidate) { return candidate?.index === pad.index; }) ?? undefined, playing() && profile.settings.vibration && inputMode === 'gamepad');
		if (pad.claimed) { controllerLost = false; audio.cue('confirm'); }
		if (pad.activity && focused && !document.hidden) setInputMode('gamepad');
		container.dataset['controllerState'] = pad.connected ? 'connected' : controllerLost ? 'disconnected' : pad.available ? 'available' : 'none';
		const controllerStatus = pad.connected ? 'CONTROLLER CONNECTED' : controllerLost ? 'CONTROLLER LOST · PRESS A / MENU TO RECONNECT, THEN RESUME' : pad.available ? 'PRESS A / MENU TO CONNECT CONTROLLER' : 'CONTROLLER OPTIONAL · CONNECT AND PRESS A / MENU';
		if (element('controller-status').textContent !== controllerStatus) element('controller-status').textContent = controllerStatus;
		if (pad.pause && focused && !document.hidden && !contextLost) { audio.cue('back'); if (auxiliary) closeAuxiliary(); else setPaused(screen === 'playing'); }
		const root = menu();
		if (root && pad.connected && screenRevision === revisionAtFrame && focused && !document.hidden && !contextLost) {
			if (Math.abs(pad.scroll) > 0.15) (root.querySelector<HTMLElement>('.frame-list') ?? root).scrollTop += pad.scroll * elapsed * 540;
			if (pad.navigate) {
				const focusedElement = document.activeElement;
				if (pad.adjust && focusedElement instanceof HTMLInputElement && focusedElement.type === 'range') {
					focusedElement.value = String(Math.max(Number(focusedElement.min), Math.min(Number(focusedElement.max), Number(focusedElement.value) + pad.adjust * 5)));
					focusedElement.dispatchEvent(new Event('input', { bubbles: true }));
				} else {
					const items = focusable(root); const index = items.findIndex(function (item) { return item === focusedElement; });
					const next = index < 0 ? (pad.navigate < 0 ? items.length - 1 : 0) : (index + pad.navigate + items.length) % items.length;
					items[next]?.focus({ preventScroll: true }); items[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
				}
				audio.cue('focus');
			}
			if (pad.confirm && document.activeElement instanceof HTMLElement && root.contains(document.activeElement)) document.activeElement.click();
			if (pad.back && screenRevision === revisionAtFrame) { audio.cue('back'); if (auxiliary) closeAuxiliary(); else if (screen === 'loadout') toBriefing(); else if (screen === 'requisition' && !element('replace-panel').hidden) showDraft(); else if (screen === 'pause-panel') setPaused(false); }
		}
		if (playing() && screenRevision === revisionAtFrame) {
			if (Math.hypot(pad.aimX, pad.aimY) > 0.2) {
				aimMode = 'gamepad';
				const origin = presentation.toScreen(state.player); const length = Math.hypot(pad.aimX, pad.aimY);
				const projected = presentation.toGround({ x: origin.x + pad.aimX / length * 380, y: origin.y + pad.aimY / length * 380 });
				if (projected) aim = projected;
				const facility = state.mission?.structure;
				const aimTargets = [...state.enemies, ...(facility && facility.hp > 0 ? [facility] : [])];
				const targets = aimTargets.map(function (enemy) { const at = presentation.toScreen(enemy); const dx = at.x - origin.x; const dy = at.y - origin.y; return { enemy, alignment: (dx * pad.aimX + dy * pad.aimY) / Math.max(1, Math.hypot(dx, dy) * length) }; }).filter(function (target) { return target.alignment > 0.975 && distance(target.enemy, state.player) < 850; }).sort(function (a, b) { return b.alignment - a.alignment; });
				const target = targets[0]; if (target) aim = { x: target.enemy.x, y: target.enemy.y };
			} else if (pointer && aimMode === 'pointer') {
				aim = presentation.toGround(pointer) ?? aim;
				const cursor = pointer;
				const facility = state.mission?.structure;
				const picked = [...state.enemies, ...(facility && facility.hp > 0 ? [facility] : [])].sort(function (a, b) { return distance(presentation.toScreen(a, 45), cursor) - distance(presentation.toScreen(b, 45), cursor); })[0];
				if (picked && distance(presentation.toScreen(picked, 45), cursor) < 42 * viewScale(width, height)) aim = { x: picked.x, y: picked.y };
			}
			const makeInput = function (): Controls { return { drive: Math.max(-1, Math.min(1, Number(active('forward')) - Number(active('back')) + pad.drive)), stop: active('stop') || pad.stop, turn: Math.max(-1, Math.min(1, Number(active('right')) - Number(active('left')) + pad.turn)), aim, fire: [active('mount-0') || pad.fire[0], active('mount-1') || pad.fire[1], active('mount-2') || pad.fire[2], active('mount-3') || pad.fire[3]], coolant: active('coolant') || pad.coolant }; };
			accumulator += elapsed;
			while (accumulator >= 1 / 60 && playing()) {
				const previousGaits = gaits;
				const previousStage = training?.stage;
				const previousMissionStage = state.mission?.stage;
				if (training) stepTraining(training, makeInput(), 1 / 60); else step(state, makeInput(), 1 / 60);
				gaits = training?.stage === 'evade' && previousStage !== 'evade' ? createGaits(state) : advanceGaits(gaits, state);
				pending.clear(); accumulator -= 1 / 60;
				if (training && previousStage !== training.stage) audio.cue('confirm');
				audio.update(audioFrame(now)); audio.play(state.events);
				feedback.play(state.events, now);
				for (const index of [0, 1] as const) if (previousGaits.player.feet[index].lift > 0 && gaits.player.feet[index].lift === 0) audio.footstep(index === 0 ? -1 : 1);
				if (state.events.includes('pickup')) { message = 'SALVAGE RECOVERED'; messageUntil = state.time + 2.5; }
				if (state.mission?.stage === 'extract' && previousMissionStage !== 'extract') { message = 'OBJECTIVE COMPLETE · REACH EXTRACTION AND HOLD FOR 3 SECONDS'; messageUntil = state.time + 7; }
				if (state.events.includes('wave')) { message = getWaveDefinition(state.wave).briefing.toUpperCase(); messageUntil = state.time + 5; }
				if (state.events.includes('coolant')) { message = 'COOLANT PURGE / REACTOR STABILIZING'; messageUntil = state.time + 2; }
				if (training?.stage === 'complete') { screen = 'training-result'; syncScreen(); }
				else if (!training && state.outcome !== 'playing') showResult(now); else if (!training && state.phase === 'requisition') showDraft(); else if (!training && state.phase === 'refit') showRefit();
			}
		}
		audio.update(audioFrame(now));
		if (!contextLost && screen !== 'bridge' && screen !== 'jump') presentation.render(state, aim, gaits, motionReduced(), screen === 'brief' || screen === 'loadout', hudObstructions, inputMode === 'gamepad' || profile.settings.couchUI, screen === 'loadout');
		if (now - lastHud > 80 || lastHud === 0) { updateHud(); lastHud = now; }
		frame = requestAnimationFrame(tick);
	};
	updateSettings(); updateRecordSummary(); refreshBridge(); syncScreen(); frame = requestAnimationFrame(tick);
	return async function () { cancelAnimationFrame(frame); abort.abort(); resetInput(); padInput.reset(); await feedback.dispose(); try { await audio.dispose(); } finally { await presentation.dispose(); } };
});
if (import.meta.hot) import.meta.hot.dispose(shutdown);
