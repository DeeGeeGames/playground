// ECSpresso 0.24.1 tracks keyup but has no public keyboard-reset API.
// Release only the keys this game binds when focus leaves the page.
export const releaseKeysOnBlur = function (keys: readonly string[]): () => void {
	const release = function () {
		for (const key of keys) window.dispatchEvent(new KeyboardEvent('keyup', { key }));
	};
	window.addEventListener('blur', release);
	return function () { window.removeEventListener('blur', release); };
};
