import type { InputMode } from './types';
import { SCROLL_THRESHOLD } from './constants';

export class InputManager {
	private mode: InputMode = 'pen-priority';
	private penActive = false;
	private activePointerId: number | null = null;

	// Finger tracking for scroll gesture detection
	private fingerStartX = 0;
	private fingerStartY = 0;

	// Hover cursor element
	private cursorEl: HTMLElement | null = null;
	private showHoverCursor = true;

	setMode(mode: InputMode): void {
		this.mode = mode;
	}

	getMode(): InputMode {
		return this.mode;
	}

	setShowHoverCursor(show: boolean): void {
		this.showHoverCursor = show;
	}

	/**
	 * Determine if a pointer event should be handled for drawing.
	 * Returns true if the event should trigger drawing, false if it should be ignored.
	 */
	shouldHandleForDrawing(e: PointerEvent): boolean {
		const { pointerType } = e;

		switch (this.mode) {
			case 'pen-only':
				return pointerType === 'pen';

			case 'touch-draw':
				// Accept both pen and touch for drawing
				if (pointerType === 'pen') return true;
				if (pointerType === 'touch') {
					// Still reject if pen is active (palm)
					return !this.penActive;
				}
				return pointerType === 'mouse';

			case 'pen-priority':
			default:
				// Pen always draws
				if (pointerType === 'pen') return true;
				// Mouse draws (desktop)
				if (pointerType === 'mouse') return true;
				// Touch: reject if pen is active (palm rejection)
				if (pointerType === 'touch') return false;
				return false;
		}
	}

	/**
	 * Called on pointerdown to track pen state.
	 */
	onPointerDown(e: PointerEvent): void {
		if (e.pointerType === 'pen') {
			this.penActive = true;
			this.activePointerId = e.pointerId;
		} else if (e.pointerType === 'touch') {
			this.fingerStartX = e.clientX;
			this.fingerStartY = e.clientY;
		}
	}

	/**
	 * Called on pointerup to clear pen state.
	 */
	onPointerUp(e: PointerEvent): void {
		if (e.pointerType === 'pen' && e.pointerId === this.activePointerId) {
			this.penActive = false;
			this.activePointerId = null;
		}
	}

	/**
	 * Check if a touch move event looks like a scroll gesture.
	 */
	isScrollGesture(e: PointerEvent): boolean {
		if (e.pointerType !== 'touch') return false;

		const deltaX = Math.abs(e.clientX - this.fingerStartX);
		const deltaY = Math.abs(e.clientY - this.fingerStartY);

		return deltaY > SCROLL_THRESHOLD && deltaY > deltaX;
	}

	isPenActive(): boolean {
		return this.penActive;
	}

	/**
	 * Create and manage the hover cursor element that follows the S-Pen.
	 */
	createHoverCursor(container: HTMLElement): HTMLElement {
		this.cursorEl = document.createElement('div');
		this.cursorEl.className = 'pen-cursor';
		container.appendChild(this.cursorEl);
		return this.cursorEl;
	}

	/**
	 * Update hover cursor position and size.
	 * Called on pointermove with pointerType === "pen" even without contact (hover).
	 */
	updateHoverCursor(e: PointerEvent, brushSize: number, color: string): void {
		if (!this.cursorEl || !this.showHoverCursor) return;

		if (e.pointerType === 'pen' && e.pressure === 0) {
			// S-Pen hovering (not touching screen)
			this.cursorEl.classList.add('visible');
			this.cursorEl.style.left = `${e.clientX - brushSize / 2}px`;
			this.cursorEl.style.top = `${e.clientY - brushSize / 2}px`;
			this.cursorEl.style.width = `${brushSize}px`;
			this.cursorEl.style.height = `${brushSize}px`;
			this.cursorEl.style.borderColor = color;
		} else {
			this.cursorEl.classList.remove('visible');
		}
	}

	/**
	 * Apply appropriate touch-action CSS based on current state.
	 */
	applyTouchAction(canvas: HTMLCanvasElement, isDrawingMode: boolean): void {
		canvas.classList.toggle('drawing-active', isDrawingMode);
	}

	destroyHoverCursor(): void {
		if (this.cursorEl) {
			this.cursorEl.remove();
			this.cursorEl = null;
		}
	}
}
