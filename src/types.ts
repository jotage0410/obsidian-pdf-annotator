export interface Point {
	x: number;
	y: number;
	pressure: number;
}

export interface Stroke {
	id: string;
	tool: 'pen' | 'highlighter';
	color: string;
	maxWidth: number;
	points: Point[];
}

export interface TextHighlight {
	id: string;
	color: string;
	text: string;
	rects: NormalizedRect[];
}

export interface NormalizedRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PageAnnotations {
	strokes: Stroke[];
	textHighlights: TextHighlight[];
}

export interface AnnotationData {
	version: number;
	pdfHash: string;
	pages: Record<string, PageAnnotations>;
}

export interface HistoryAction {
	type: 'add-stroke' | 'remove-stroke' | 'add-highlight' | 'remove-highlight';
	pageIndex: number;
	data: Stroke | TextHighlight;
}

export type ToolType = 'pen' | 'highlighter' | 'text-highlight' | 'eraser' | 'pan';

export type InputMode = 'pen-priority' | 'touch-draw' | 'pen-only';
