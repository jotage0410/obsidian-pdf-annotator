import { DrawingEngine } from './drawing-engine';
import { InputManager } from './input-manager';
import type { Stroke, TextHighlight } from './types';
import { DEFAULT_PEN_COLOR, DEFAULT_PEN_WIDTH, DEFAULT_ERASER_RADIUS, MAX_POINTS_PER_STROKE } from './constants';
import { generateId } from './utils';

export class AnnotationCanvas {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private drawingEngine: DrawingEngine;
	private pageWidth: number;
	private pageHeight: number;
	private pageIndex: number;

	// Drawing state
	private isDrawing = false;
	private currentStroke: Stroke | null = null;
	private currentPixelPoints: [number, number, number][] = [];
	private strokes: Stroke[] = [];
	private textHighlights: TextHighlight[] = [];
	private rafId: number | null = null;
	private needsRender = false;

	// Tool state
	private activeTool: 'pen' | 'highlighter' | 'eraser' | 'pan' | 'text-highlight' = 'pen';
	private penColor = DEFAULT_PEN_COLOR;
	private penWidth = DEFAULT_PEN_WIDTH;
	private eraserRadius = DEFAULT_ERASER_RADIUS;

	// Input manager (shared across pages)
	private inputManager: InputManager;

	// Callbacks
	private onStrokeAdded: ((stroke: Stroke, pageIndex: number) => void) | null = null;
	private onStrokeRemoved: ((stroke: Stroke, pageIndex: number) => void) | null = null;
	private onTextHighlightRemoved: ((highlight: TextHighlight, pageIndex: number) => void) | null = null;

	// Bound handlers for cleanup
	private boundPointerDown: (e: PointerEvent) => void;
	private boundPointerMove: (e: PointerEvent) => void;
	private boundPointerUp: (e: PointerEvent) => void;

	constructor(
		annotationLayer: HTMLElement,
		pageIndex: number,
		pageWidth: number,
		pageHeight: number,
		inputManager?: InputManager,
	) {
		this.pageIndex = pageIndex;
		this.pageWidth = pageWidth;
		this.pageHeight = pageHeight;
		this.drawingEngine = new DrawingEngine();
		this.inputManager = inputManager ?? new InputManager();

		const dpr = window.devicePixelRatio || 1;

		// Create annotation canvas
		this.canvas = document.createElement('canvas');
		this.canvas.width = pageWidth * dpr;
		this.canvas.height = pageHeight * dpr;
		this.canvas.style.width = `${pageWidth}px`;
		this.canvas.style.height = `${pageHeight}px`;

		const ctx = this.canvas.getContext('2d');
		if (!ctx) throw new Error('Failed to get 2D context');
		ctx.scale(dpr, dpr);
		this.ctx = ctx;

		annotationLayer.appendChild(this.canvas);

		// Bind event handlers
		this.boundPointerDown = this.onPointerDown.bind(this);
		this.boundPointerMove = this.onPointerMove.bind(this);
		this.boundPointerUp = this.onPointerUp.bind(this);

		this.canvas.addEventListener('pointerdown', this.boundPointerDown);
		this.canvas.addEventListener('pointermove', this.boundPointerMove);
		this.canvas.addEventListener('pointerup', this.boundPointerUp);
		this.canvas.addEventListener('pointerleave', this.boundPointerUp);
		this.canvas.addEventListener('pointercancel', this.boundPointerUp);
	}

	setTool(tool: 'pen' | 'highlighter' | 'eraser' | 'pan' | 'text-highlight'): void {
		this.activeTool = tool;
		// Use CSS classes instead of inline styles for pointer-events
		this.canvas.classList.toggle('tool-pan', tool === 'pan');
		this.canvas.classList.toggle('tool-text-highlight', tool === 'text-highlight');
	}

	setColor(color: string): void {
		this.penColor = color;
	}

	setWidth(width: number): void {
		this.penWidth = width;
	}

	setEraserRadius(radius: number): void {
		this.eraserRadius = radius;
	}

	setOnStrokeAdded(cb: (stroke: Stroke, pageIndex: number) => void): void {
		this.onStrokeAdded = cb;
	}

	setOnStrokeRemoved(cb: (stroke: Stroke, pageIndex: number) => void): void {
		this.onStrokeRemoved = cb;
	}

	setOnTextHighlightRemoved(cb: (highlight: TextHighlight, pageIndex: number) => void): void {
		this.onTextHighlightRemoved = cb;
	}

	loadStrokes(strokes: Stroke[]): void {
		this.strokes = [...strokes];
		this.redraw();
	}

	addStroke(stroke: Stroke): void {
		this.strokes.push(stroke);
		this.redraw();
	}

	removeStroke(strokeId: string): Stroke | null {
		const idx = this.strokes.findIndex(s => s.id === strokeId);
		if (idx === -1) return null;
		const removed = this.strokes.splice(idx, 1)[0];
		this.redraw();
		return removed;
	}

	getStrokes(): Stroke[] {
		return [...this.strokes];
	}

	addTextHighlight(highlight: TextHighlight): void {
		this.textHighlights.push(highlight);
		this.redraw();
	}

	removeTextHighlight(highlightId: string): TextHighlight | null {
		const idx = this.textHighlights.findIndex(h => h.id === highlightId);
		if (idx === -1) return null;
		const removed = this.textHighlights.splice(idx, 1)[0];
		this.redraw();
		return removed;
	}

	loadTextHighlights(highlights: TextHighlight[]): void {
		this.textHighlights = [...highlights];
		this.redraw();
	}

	getTextHighlights(): TextHighlight[] {
		return [...this.textHighlights];
	}

	private onPointerDown(e: PointerEvent): void {
		this.inputManager.onPointerDown(e);

		// Update hover cursor
		this.inputManager.updateHoverCursor(e, this.penWidth, this.penColor);

		if (this.activeTool === 'pan' || this.activeTool === 'text-highlight') return;

		// Palm rejection: check if this input should be handled
		if (!this.inputManager.shouldHandleForDrawing(e)) return;

		if (this.activeTool === 'eraser') {
			this.handleEraserPoint(e);
			return;
		}

		e.preventDefault();
		this.canvas.setPointerCapture(e.pointerId);
		this.inputManager.applyTouchAction(this.canvas, true);
		this.isDrawing = true;

		const { x, y } = this.getCanvasPoint(e);
		const pressure = e.pressure || 0.5;

		this.currentStroke = {
			id: generateId(),
			tool: this.activeTool as 'pen' | 'highlighter',
			color: this.penColor,
			maxWidth: this.penWidth,
			points: [{ x: x / this.pageWidth, y: y / this.pageHeight, pressure }],
		};

		this.currentPixelPoints = [[x, y, pressure]];
	}

	private onPointerMove(e: PointerEvent): void {
		// Update hover cursor on any pen move (including hover)
		this.inputManager.updateHoverCursor(e, this.penWidth, this.penColor);

		if (!this.inputManager.shouldHandleForDrawing(e)) return;

		if (this.activeTool === 'eraser' && e.buttons > 0) {
			this.handleEraserPoint(e);
			return;
		}

		if (!this.isDrawing || !this.currentStroke) return;

		e.preventDefault();

		// Process coalesced events for smoothness
		const events = e.getCoalescedEvents?.() ?? [e];
		for (const ce of events) {
			// Enforce max points per stroke to prevent memory issues
			if (this.currentStroke.points.length >= MAX_POINTS_PER_STROKE) break;

			const { x, y } = this.getCanvasPoint(ce);
			const pressure = ce.pressure || 0.5;

			this.currentStroke.points.push({
				x: x / this.pageWidth,
				y: y / this.pageHeight,
				pressure,
			});
			this.currentPixelPoints.push([x, y, pressure]);
		}

		// Throttle rendering to rAF (max 60fps)
		if (!this.needsRender) {
			this.needsRender = true;
			this.rafId = requestAnimationFrame(() => {
				this.needsRender = false;
				this.redraw();
				// Guard against race: currentStroke may have been nulled by onPointerUp
				const stroke = this.currentStroke;
				const points = this.currentPixelPoints;
				if (stroke && points.length >= 2) {
					this.drawingEngine.renderLiveStroke(
						this.ctx,
						points,
						stroke.color,
						stroke.maxWidth,
						stroke.tool,
					);
				}
			});
		}
	}

	private onPointerUp(e: PointerEvent): void {
		this.inputManager.onPointerUp(e);
		this.inputManager.applyTouchAction(this.canvas, false);

		// Release pointer capture if held
		try {
			if (this.canvas.hasPointerCapture(e.pointerId)) {
				this.canvas.releasePointerCapture(e.pointerId);
			}
		} catch {
			// Ignore if pointer capture was already released
		}

		if (!this.isDrawing || !this.currentStroke) {
			this.isDrawing = false;
			return;
		}

		e.preventDefault();
		this.isDrawing = false;

		if (this.currentStroke.points.length >= 2) {
			this.strokes.push(this.currentStroke);
			if (this.onStrokeAdded) {
				this.onStrokeAdded(this.currentStroke, this.pageIndex);
			}
		}

		this.currentStroke = null;
		this.currentPixelPoints = [];
		this.redraw();
	}

	private handleEraserPoint(e: PointerEvent): void {
		// Process coalesced events for smooth eraser path
		const events = e.getCoalescedEvents?.() ?? [e];
		const removedStrokes: Stroke[] = [];
		const removedHighlights: TextHighlight[] = [];

		for (const ce of events) {
			const { x, y } = this.getCanvasPoint(ce);

			// Erase strokes
			for (let i = this.strokes.length - 1; i >= 0; i--) {
				const stroke = this.strokes[i];
				for (const pt of stroke.points) {
					const px = pt.x * this.pageWidth;
					const py = pt.y * this.pageHeight;
					const dist = Math.hypot(px - x, py - y);
					if (dist < this.eraserRadius) {
						const removed = this.strokes.splice(i, 1)[0];
						removedStrokes.push(removed);
						break;
					}
				}
			}

			// Erase text highlights
			const nx = x / this.pageWidth;
			const ny = y / this.pageHeight;
			for (let i = this.textHighlights.length - 1; i >= 0; i--) {
				const highlight = this.textHighlights[i];
				for (const rect of highlight.rects) {
					if (nx >= rect.x && nx <= rect.x + rect.width &&
						ny >= rect.y && ny <= rect.y + rect.height) {
						const removed = this.textHighlights.splice(i, 1)[0];
						removedHighlights.push(removed);
						break;
					}
				}
			}
		}

		let needsRedraw = false;

		if (removedStrokes.length > 0) {
			for (const removed of removedStrokes) {
				this.onStrokeRemoved?.(removed, this.pageIndex);
			}
			needsRedraw = true;
		}

		if (removedHighlights.length > 0) {
			for (const removed of removedHighlights) {
				this.onTextHighlightRemoved?.(removed, this.pageIndex);
			}
			needsRedraw = true;
		}

		if (needsRedraw) {
			this.redraw();
		}
	}

	private getCanvasPoint(e: PointerEvent): { x: number; y: number } {
		const rect = this.canvas.getBoundingClientRect();
		const w = rect.width || 1; // Prevent division by zero
		const h = rect.height || 1;
		return {
			x: (e.clientX - rect.left) * (this.pageWidth / w),
			y: (e.clientY - rect.top) * (this.pageHeight / h),
		};
	}

	private redraw(): void {
		this.drawingEngine.redrawAll(this.ctx, this.strokes, this.pageWidth, this.pageHeight, this.textHighlights);
	}

	destroy(): void {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
		}
		this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
		this.canvas.removeEventListener('pointermove', this.boundPointerMove);
		this.canvas.removeEventListener('pointerup', this.boundPointerUp);
		this.canvas.removeEventListener('pointerleave', this.boundPointerUp);
		this.canvas.removeEventListener('pointercancel', this.boundPointerUp);
	}
}
