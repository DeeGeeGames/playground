export type StopGame = () => void | Promise<void>;
export type StartGame = (container: HTMLElement) => Promise<StopGame>;

// Each page owns one world. Cached pages keep that world for browser Back.
export const mountGame = async function (containerId: string, start: StartGame): Promise<StopGame> {
	let stop: StopGame | undefined;
	let shutdown: Promise<void> | undefined;
	const dispose = function (): Promise<void> {
		window.removeEventListener('pagehide', onPageHide);
		shutdown ??= Promise.resolve().then(function () { return stop?.(); });
		return shutdown;
	};
	const onPageHide = function (event: PageTransitionEvent) {
		if (!event.persisted) void dispose().catch(console.error);
	};
	try {
		const container = document.getElementById(containerId);
		if (!(container instanceof HTMLElement)) throw new Error(`Missing game container: ${containerId}`);
		stop = await start(container);
		window.addEventListener('pagehide', onPageHide);
	} catch (error: unknown) {
		console.error(error);
		const message = document.getElementById('error');
		if (message) {
			message.hidden = false;
			message.textContent = 'Could not start the game. Reload to try again.';
		}
	}
	return dispose;
};
