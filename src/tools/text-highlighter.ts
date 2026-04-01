import type { TextHighlight, NormalizedRect } from '../types';
import { generateId } from '../utils';

export class TextHighlighterTool {
	private pageWrapper: HTMLElement;
	private textLayerEl: HTMLElement;
	private pageIndex: number;
	private pageWidth: number;
	private pageHeight: number;
	private color: string;
	private onHighlightAdded: ((highlight: TextHighlight) => void) | null = null;
	private boundPointerUp: (e: PointerEvent) => void;

	constructor(
		pageWrapper: HTMLElement,
		textLayerEl: HTMLElement,
		pageIndex: number,
		pageWidth: number,
		pageHeight: number,
		color: string,
	) {
		this.pageWrapper = pageWrapper;
		this.textLayerEl = textLayerEl;
		this.pageIndex = pageIndex;
		this.pageWidth = pageWidth;
		this.pageHeight = pageHeight;
		this.color = color;

		this.boundPointerUp = this.onPointerUp.bind(this);
	}

	setColor(color: string): void {
		this.color = color;
	}

	setOnHighlightAdded(cb: (highlight: TextHighlight) => void): void {
		this.onHighlightAdded = cb;
	}

	activate(): void {
		this.textLayerEl.classList.add('active');
		this.textLayerEl.addEventListener('pointerup', this.boundPointerUp);
	}

	deactivate(): void {
		this.textLayerEl.classList.remove('active');
		this.textLayerEl.removeEventListener('pointerup', this.boundPointerUp);
	}

	private onPointerUp(_e: PointerEvent): void {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) return;

		const range = selection.getRangeAt(0);
		const text = selection.toString().trim();
		if (!text) return;

		const rects = this.getSelectionRects(range);
		if (rects.length === 0) return;

		const highlight: TextHighlight = {
			id: generateId(),
			color: this.color,
			text,
			rects,
		};

		if (this.onHighlightAdded) {
			this.onHighlightAdded(highlight);
		}

		// Clear selection
		selection.removeAllRanges();
	}

	private getSelectionRects(range: Range): NormalizedRect[] {
		const wrapperRect = this.pageWrapper.getBoundingClientRect();
		const clientRects = range.getClientRects();
		const normalized: NormalizedRect[] = [];

		for (let i = 0; i < clientRects.length; i++) {
			const rect = clientRects[i];
			// Convert to normalized coordinates relative to page
			normalized.push({
				x: (rect.left - wrapperRect.left) / wrapperRect.width,
				y: (rect.top - wrapperRect.top) / wrapperRect.height,
				width: rect.width / wrapperRect.width,
				height: rect.height / wrapperRect.height,
			});
		}

		return this.mergeOverlappingRects(normalized);
	}

	/**
	 * Merge rects that are on the same line (similar y position).
	 */
	private mergeOverlappingRects(rects: NormalizedRect[]): NormalizedRect[] {
		if (rects.length <= 1) return rects;

		const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
		const merged: NormalizedRect[] = [sorted[0]];

		for (let i = 1; i < sorted.length; i++) {
			const last = merged[merged.length - 1];
			const curr = sorted[i];

			// Same line if y positions are close enough
			if (Math.abs(curr.y - last.y) < 0.005) {
				// Merge horizontally
				const right = Math.max(last.x + last.width, curr.x + curr.width);
				last.width = right - last.x;
				last.height = Math.max(last.height, curr.height);
			} else {
				merged.push(curr);
			}
		}

		return merged;
	}

	/**
	 * Render text highlights onto a canvas context.
	 */
	static renderHighlights(
		ctx: CanvasRenderingContext2D,
		highlights: TextHighlight[],
		pageWidth: number,
		pageHeight: number,
	): void {
		for (const highlight of highlights) {
			ctx.save();
			ctx.globalAlpha = 0.3;
			ctx.fillStyle = highlight.color;

			for (const rect of highlight.rects) {
				ctx.fillRect(
					rect.x * pageWidth,
					rect.y * pageHeight,
					rect.width * pageWidth,
					rect.height * pageHeight,
				);
			}

			ctx.restore();
		}
	}
}
