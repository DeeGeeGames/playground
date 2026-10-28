import type { Stick } from './game';
import { MAX_REACH, stickOffset } from './rules';

export const attachStick = (host: HTMLElement, stick: Stick) => {
	const root = document.createElement('div');
	root.className = 'stick';
	root.setAttribute('role', 'group');
	root.setAttribute('aria-label', 'Spring control. Drag to move off the mark. Release to return.');
	const knob = document.createElement('div');
	knob.className = 'stick-knob';
	const hint = document.createElement('span');
	hint.className = 'stick-hint';
	hint.textContent = 'Spring';
	hint.setAttribute('aria-hidden', 'true');
	root.append(knob, hint);
	host.append(root);

	let pointerId: number | undefined;
	const travel = () => {
		const ring = root.getBoundingClientRect();
		const cap = knob.getBoundingClientRect();
		return Math.max(0, ring.width / 2 - cap.width / 2);
	};
	const place = (clientX: number, clientY: number) => {
		const rect = root.getBoundingClientRect();
		const offset = stickOffset(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2), travel(), MAX_REACH);
		stick.active = true;
		stick.x = offset.x;
		stick.y = offset.y;
		knob.style.transform = `translate(calc(-50% + ${offset.knobX}px), calc(-50% + ${offset.knobY}px))`;
		root.classList.add('is-held');
	};
	const releasePointer = (id: number) => {
		if (pointerId !== id) return;
		pointerId = undefined;
		stick.active = false;
		stick.x = 0;
		stick.y = 0;
		knob.style.transform = 'translate(-50%, -50%)';
		root.classList.remove('is-held');
		if (root.hasPointerCapture(id)) root.releasePointerCapture(id);
	};
	const reset = () => {
		if (pointerId !== undefined) releasePointer(pointerId);
	};
	const down = (event: PointerEvent) => {
		if (pointerId !== undefined || !event.isPrimary) return;
		pointerId = event.pointerId;
		root.setPointerCapture(event.pointerId);
		event.preventDefault();
		place(event.clientX, event.clientY);
	};
	const move = (event: PointerEvent) => {
		if (event.pointerId !== pointerId) return;
		event.preventDefault();
		place(event.clientX, event.clientY);
	};
	const up = (event: PointerEvent) => {
		releasePointer(event.pointerId);
	};
	const menu = (event: Event) => {
		event.preventDefault();
	};
	const onHide = () => {
		if (document.hidden) reset();
	};
	root.addEventListener('pointerdown', down);
	root.addEventListener('pointermove', move);
	root.addEventListener('pointerup', up);
	root.addEventListener('pointercancel', up);
	root.addEventListener('lostpointercapture', up);
	root.addEventListener('contextmenu', menu);
	window.addEventListener('blur', reset);
	document.addEventListener('visibilitychange', onHide);
	return {
		dispose() {
			reset();
			root.removeEventListener('pointerdown', down);
			root.removeEventListener('pointermove', move);
			root.removeEventListener('pointerup', up);
			root.removeEventListener('pointercancel', up);
			root.removeEventListener('lostpointercapture', up);
			root.removeEventListener('contextmenu', menu);
			window.removeEventListener('blur', reset);
			document.removeEventListener('visibilitychange', onHide);
			root.remove();
		},
	};
};
