import type { ToolType } from './types';
import { DEFAULT_PEN_COLOR, DEFAULT_PEN_WIDTH, DEFAULT_HIGHLIGHTER_COLOR, DEFAULT_HIGHLIGHTER_WIDTH } from './constants';

type ToolStateListener = () => void;

export class ToolState {
	activeTool: ToolType = 'pen';
	penColor: string = DEFAULT_PEN_COLOR;
	penWidth: number = DEFAULT_PEN_WIDTH;
	highlighterColor: string = DEFAULT_HIGHLIGHTER_COLOR;
	highlighterWidth: number = DEFAULT_HIGHLIGHTER_WIDTH;

	private listeners: ToolStateListener[] = [];

	on(listener: ToolStateListener): void {
		this.listeners.push(listener);
	}

	off(listener: ToolStateListener): void {
		this.listeners = this.listeners.filter(l => l !== listener);
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}

	setTool(tool: ToolType): void {
		this.activeTool = tool;
		this.emit();
	}

	setPenColor(color: string): void {
		this.penColor = color;
		this.emit();
	}

	setPenWidth(width: number): void {
		this.penWidth = width;
		this.emit();
	}

	setHighlighterColor(color: string): void {
		this.highlighterColor = color;
		this.emit();
	}

	getCurrentColor(): string {
		return this.activeTool === 'highlighter' ? this.highlighterColor : this.penColor;
	}

	getCurrentWidth(): number {
		return this.activeTool === 'highlighter' ? this.highlighterWidth : this.penWidth;
	}
}
