import { getStroke } from 'perfect-freehand';
import type { Stroke, TextHighlight } from './types';
import { TextHighlighterTool } from './tools/text-highlighter';

export class DrawingEngine {
	/**
	 * Render a single stroke onto a canvas context.
	 * Points are expected in pixel coordinates (already denormalized).
	 */
	renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, pageWidth: number, pageHeight: number): void {
		if (stroke.points.length < 2) return;

		// Denormalize points from 0-1 to pixel coordinates
		const pixelPoints: [number, number, number][] = stroke.points.map(p => [
			p.x * pageWidth,
			p.y * pageHeight,
			p.pressure,
		]);

		if (stroke.tool === 'highlighter') {
			this.renderHighlighterStroke(ctx, pixelPoints, stroke.color, stroke.maxWidth);
		} else {
			this.renderPenStroke(ctx, pixelPoints, stroke.color, stroke.maxWidth);
		}
	}

	/**
	 * Render a live stroke during drawing (points already in pixel coords).
	 */
	renderLiveStroke(
		ctx: CanvasRenderingContext2D,
		points: [number, number, number][],
		color: string,
		maxWidth: number,
		tool: 'pen' | 'highlighter',
	): void {
		if (points.length < 2) return;

		if (tool === 'highlighter') {
			this.renderHighlighterStroke(ctx, points, color, maxWidth);
		} else {
			this.renderPenStroke(ctx, points, color, maxWidth);
		}
	}

	private renderPenStroke(
		ctx: CanvasRenderingContext2D,
		points: [number, number, number][],
		color: string,
		size: number,
	): void {
		const outlinePoints = getStroke(points, {
			size,
			thinning: 0.5,
			smoothing: 0.5,
			streamline: 0.5,
			simulatePressure: false,
			start: { cap: true, taper: 0 },
			end: { cap: true, taper: 0 },
		});

		if (outlinePoints.length < 2) return;

		const pathData = this.getSvgPathFromPoints(outlinePoints);
		const path = new Path2D(pathData);

		ctx.save();
		ctx.fillStyle = color;
		ctx.fill(path);
		ctx.restore();
	}

	private renderHighlighterStroke(
		ctx: CanvasRenderingContext2D,
		points: [number, number, number][],
		color: string,
		width: number,
	): void {
		if (points.length < 2) return;

		ctx.save();
		ctx.globalAlpha = 0.3;
		ctx.strokeStyle = color;
		ctx.lineWidth = width;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		ctx.beginPath();
		ctx.moveTo(points[0][0], points[0][1]);

		for (let i = 1; i < points.length; i++) {
			const prev = points[i - 1];
			const curr = points[i];
			const mx = (prev[0] + curr[0]) / 2;
			const my = (prev[1] + curr[1]) / 2;
			ctx.quadraticCurveTo(prev[0], prev[1], mx, my);
		}

		const last = points[points.length - 1];
		ctx.lineTo(last[0], last[1]);
		ctx.stroke();
		ctx.restore();
	}

	/**
	 * Convert perfect-freehand outline points to an SVG path string.
	 */
	private getSvgPathFromPoints(points: number[][]): string {
		if (points.length < 2) return '';

		const max = points.length - 1;
		return points
			.reduce(
				(acc, point, i, arr) => {
					if (i === 0) {
						return `M ${point[0]},${point[1]}`;
					}
					if (i === max) {
						return `${acc} L ${point[0]},${point[1]}`;
					}
					const next = arr[i + 1];
					const mx = (point[0] + next[0]) / 2;
					const my = (point[1] + next[1]) / 2;
					return `${acc} Q ${point[0]},${point[1]} ${mx},${my}`;
				},
				'',
			) + ' Z';
	}

	/**
	 * Redraw all strokes for a page.
	 */
	redrawAll(
		ctx: CanvasRenderingContext2D,
		strokes: Stroke[],
		pageWidth: number,
		pageHeight: number,
		textHighlights?: TextHighlight[],
	): void {
		ctx.clearRect(0, 0, pageWidth, pageHeight);

		// Render text highlights first (below strokes)
		if (textHighlights && textHighlights.length > 0) {
			TextHighlighterTool.renderHighlights(ctx, textHighlights, pageWidth, pageHeight);
		}

		for (const stroke of strokes) {
			this.renderStroke(ctx, stroke, pageWidth, pageHeight);
		}
	}
}
