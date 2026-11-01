export type ControllerDirection = 'up' | 'right' | 'down' | 'left';
export type ControllerHandlers = {
	command: () => void;
	back: () => void;
	pause: () => void;
	direction: (direction: ControllerDirection) => boolean;
	activate?: () => boolean;
};

// Standard mapping: X / west = Coverage, A / south = activate, B / east = back,
// Start / menu = pause. D-pad navigates commands; coverage owns spatial movement.
// A new connection or focus session samples held buttons before accepting edges.
export const createButtonEdges = function () {
	let previous: readonly boolean[] = [];
	let previousIdentity: string | undefined;
	return function (identity: string | undefined, buttons: readonly boolean[]): readonly number[] {
		const edges = identity !== undefined && identity === previousIdentity
			? buttons.flatMap(function (pressed, index) { return pressed && !previous[index] ? [index] : []; }) : [];
		previous = [...buttons]; previousIdentity = identity;
		return edges;
	};
};

export const createController = function (root: HTMLElement, handlers: ControllerHandlers, signal: AbortSignal) {
	const edges = createButtonEdges();
	const reset = function () { edges(undefined, []); };
	window.addEventListener('blur', reset, { signal });
	window.addEventListener('focus', reset, { signal });
	window.addEventListener('gamepadconnected', reset, { signal });
	window.addEventListener('gamepaddisconnected', reset, { signal });
	document.addEventListener('visibilitychange', reset, { signal });
	const visible = function (control: HTMLElement) {
		return !control.closest('[hidden], [inert]') && control.getClientRects().length > 0 && getComputedStyle(control).visibility !== 'hidden';
	};
	const controls = function () {
		// A pause, briefing or result overlay owns controller focus while visible.
		const modal = [...root.querySelectorAll<HTMLElement>('.overlay, [role="dialog"]')].filter(visible).at(-1);
		return [...(modal ?? root).querySelectorAll<HTMLElement>('button, select, summary, a[href], input')].filter(function (control) {
			return visible(control) && !control.matches(':disabled') && control.tabIndex >= 0;
		});
	};
	const focus = function (control: HTMLElement | undefined) {
		if (!control) return;
		control.focus({ preventScroll: true });
		control.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
	};
	const navigate = function (direction: ControllerDirection) {
		if (handlers.direction(direction)) return;
		const candidates = controls();
		const active = document.activeElement;
		if (active instanceof HTMLSelectElement && candidates.includes(active) && (direction === 'left' || direction === 'right')) {
			const delta = direction === 'left' ? -1 : 1;
			let index = active.selectedIndex + delta;
			while (index >= 0 && index < active.options.length) {
				const option = active.options[index];
				if (option && !option.disabled) {
					active.selectedIndex = index; active.dispatchEvent(new Event('change', { bubbles: true })); return;
				}
				index += delta;
			}
			return;
		}
		const index = candidates.findIndex(function (control) { return control === active; });
		const delta = direction === 'up' || direction === 'left' ? -1 : 1;
		const next = index < 0 ? 0 : (index + delta + candidates.length) % candidates.length;
		focus(candidates[next]);
	};
	return {
		poll: function () {
			if (signal.aborted || document.hidden || !document.hasFocus()) { reset(); return; }
			const pad = navigator.getGamepads?.().find(function (candidate) { return candidate?.connected && candidate.mapping === 'standard'; });
			const pressed = edges(pad ? `${pad.index}:${pad.id}` : undefined, pad?.buttons.map(function (button) { return button.pressed; }) ?? []);
			// Handle one command per frame so simultaneous buttons cannot issue two orders.
			if (pressed.includes(9)) { handlers.pause(); return; }
			if (pressed.includes(1)) { handlers.back(); return; }
			if (pressed.includes(2)) { handlers.command(); return; }
			if (pressed.includes(0)) {
				if (handlers.activate?.()) return;
				const candidates = controls(); const active = document.activeElement;
				if (active instanceof HTMLElement && candidates.includes(active)) {
					if (active instanceof HTMLSelectElement) navigate('right'); else active.click();
				} else focus(candidates[0]);
				return;
			}
			if (pressed.includes(12)) navigate('up');
			else if (pressed.includes(13)) navigate('down');
			else if (pressed.includes(14)) navigate('left');
			else if (pressed.includes(15)) navigate('right');
		},
	};
};
