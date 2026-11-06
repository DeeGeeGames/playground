export const zoomForWheel = function (zoom: number, event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>, pageHeight: number): number {
	const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? pageHeight : 1;
	return Math.max(0.5, Math.min(2.5, zoom * Math.exp(-event.deltaY * unit * 0.0015)));
};
