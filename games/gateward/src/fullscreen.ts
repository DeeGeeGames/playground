export const attachFullscreen = function (container: HTMLElement, control: HTMLButtonElement, status: HTMLElement) {
	const abort = new AbortController();
	const options = { signal: abort.signal };
	let expanded = false;
	let disposed = false;
	const sync = function () {
		const active = expanded || document.fullscreenElement === container;
		control.textContent = active ? 'Exit fullscreen' : 'Fullscreen';
		control.setAttribute('aria-pressed', String(active));
	};
	const setExpanded = function (value: boolean) {
		expanded = value;
		container.classList.toggle('is-expanded', value);
		document.documentElement.classList.toggle('gateward-expanded', value);
		sync();
	};
	control.addEventListener('click', async function () {
		control.disabled = true;
		status.textContent = '';
		try {
			if (expanded) setExpanded(false);
			else if (document.fullscreenElement === container) await document.exitFullscreen();
			else {
				try {
					if (!document.fullscreenEnabled || typeof container.requestFullscreen !== 'function') setExpanded(true);
					else {
						await container.requestFullscreen();
						if (disposed && document.fullscreenElement === container) await document.exitFullscreen();
					}
				} catch {
					if (!disposed) setExpanded(true);
				}
			}
		} catch {
			if (!disposed) status.textContent = 'Could not exit fullscreen. Use your browser’s fullscreen control to exit.';
		} finally {
			if (!disposed) { control.disabled = false; sync(); }
		}
	}, options);
	document.addEventListener('fullscreenchange', sync, options);
	window.addEventListener('keydown', function (event) {
		if (event.key !== 'Escape' || !expanded) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		setExpanded(false);
		control.focus({ preventScroll: true });
	}, { ...options, capture: true });
	sync();
	control.hidden = false;
	return function () {
		disposed = true;
		abort.abort();
		setExpanded(false);
		control.hidden = true;
		if (document.fullscreenElement === container) void document.exitFullscreen().catch(console.error);
	};
};
