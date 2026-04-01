import { ToolState } from './tool-state';
import type { ToolType } from './types';
import { COLOR_PRESETS, HIGHLIGHTER_PRESETS, MIN_PEN_WIDTH, MAX_PEN_WIDTH } from './constants';

// SVG icons
const ICONS: Record<string, string> = {
	pen: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
	highlighter: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>',
	'text-highlight': '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/><line x1="2" y1="22" x2="22" y2="22" stroke-width="3"/></svg>',
	eraser: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>',
	undo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>',
	redo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>',
	pan: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
};

export class Toolbar {
	private containerEl: HTMLElement;
	private toolState: ToolState;
	private toolButtons: Map<ToolType, HTMLButtonElement> = new Map();
	private colorPaletteEl: HTMLElement | null = null;
	private onUndo: (() => void) | null = null;
	private onRedo: (() => void) | null = null;

	constructor(parentEl: HTMLElement, toolState: ToolState) {
		this.toolState = toolState;

		this.containerEl = document.createElement('div');
		this.containerEl.className = 'pdf-annotator-toolbar';
		parentEl.prepend(this.containerEl);

		this.buildToolbar();

		// Listen for tool state changes
		this.toolState.on(() => this.updateActiveStates());
	}

	setOnUndo(cb: () => void): void {
		this.onUndo = cb;
	}

	setOnRedo(cb: () => void): void {
		this.onRedo = cb;
	}

	private buildToolbar(): void {
		// Drawing tools
		const tools: { type: ToolType; label: string }[] = [
			{ type: 'pen', label: 'Pen' },
			{ type: 'highlighter', label: 'Highlighter' },
			{ type: 'text-highlight', label: 'Text Highlight' },
			{ type: 'eraser', label: 'Eraser' },
		];

		for (const tool of tools) {
			const btn = this.createToolButton(tool.type, tool.label);
			this.toolButtons.set(tool.type, btn);
			this.containerEl.appendChild(btn);
		}

		// Separator
		this.containerEl.appendChild(this.createSeparator());

		// Color swatches (for pen/highlighter)
		const colorWrapper = document.createElement('div');
		colorWrapper.className = 'color-picker-wrapper';
		this.buildColorSwatches(colorWrapper);
		this.containerEl.appendChild(colorWrapper);

		// Separator
		this.containerEl.appendChild(this.createSeparator());

		// Width slider
		const slider = document.createElement('input');
		slider.type = 'range';
		slider.className = 'width-slider';
		slider.min = String(MIN_PEN_WIDTH);
		slider.max = String(MAX_PEN_WIDTH);
		slider.value = String(this.toolState.penWidth);
		slider.setAttribute('aria-label', 'Brush width');
		slider.addEventListener('input', () => {
			this.toolState.setPenWidth(Number(slider.value));
		});
		this.containerEl.appendChild(slider);

		// Separator
		this.containerEl.appendChild(this.createSeparator());

		// Undo/Redo
		const undoBtn = this.createActionButton('undo', 'Undo (Ctrl+Z)', () => this.onUndo?.());
		const redoBtn = this.createActionButton('redo', 'Redo (Ctrl+Shift+Z)', () => this.onRedo?.());
		this.containerEl.appendChild(undoBtn);
		this.containerEl.appendChild(redoBtn);

		// Separator
		this.containerEl.appendChild(this.createSeparator());

		// Pan mode
		const panBtn = this.createToolButton('pan', 'Pan / Scroll');
		this.toolButtons.set('pan', panBtn);
		this.containerEl.appendChild(panBtn);

		this.updateActiveStates();
	}

	private createToolButton(type: ToolType, label: string): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.innerHTML = ICONS[type] || '';
		btn.setAttribute('aria-label', label);
		btn.title = label;
		btn.addEventListener('click', () => {
			this.toolState.setTool(type);
		});
		return btn;
	}

	private createActionButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.innerHTML = ICONS[icon] || '';
		btn.setAttribute('aria-label', label);
		btn.title = label;
		btn.addEventListener('click', onClick);
		return btn;
	}

	private createSeparator(): HTMLElement {
		const sep = document.createElement('div');
		sep.className = 'separator';
		return sep;
	}

	private buildColorSwatches(wrapper: HTMLElement): void {
		const colors = this.toolState.activeTool === 'highlighter' ? HIGHLIGHTER_PRESETS : COLOR_PRESETS;

		wrapper.empty();
		for (const color of colors) {
			const swatch = document.createElement('button');
			swatch.className = 'color-swatch';
			swatch.style.backgroundColor = color;
			swatch.setAttribute('aria-label', `Color ${color}`);

			const currentColor = this.toolState.getCurrentColor();
			if (color === currentColor) {
				swatch.classList.add('active');
			}

			swatch.addEventListener('click', () => {
				if (this.toolState.activeTool === 'highlighter') {
					this.toolState.setHighlighterColor(color);
				} else {
					this.toolState.setPenColor(color);
				}
				this.updateColorSwatches(wrapper);
			});

			wrapper.appendChild(swatch);
		}

		// Custom color picker
		const customInput = document.createElement('input');
		customInput.type = 'color';
		customInput.value = this.toolState.getCurrentColor();
		customInput.style.width = '20px';
		customInput.style.height = '20px';
		customInput.style.border = 'none';
		customInput.style.padding = '0';
		customInput.style.cursor = 'pointer';
		customInput.setAttribute('aria-label', 'Custom color');
		customInput.addEventListener('input', () => {
			if (this.toolState.activeTool === 'highlighter') {
				this.toolState.setHighlighterColor(customInput.value);
			} else {
				this.toolState.setPenColor(customInput.value);
			}
			this.updateColorSwatches(wrapper);
		});
		wrapper.appendChild(customInput);
	}

	private updateColorSwatches(wrapper: HTMLElement): void {
		const swatches = wrapper.querySelectorAll('.color-swatch');
		const currentColor = this.toolState.getCurrentColor();
		swatches.forEach(s => {
			const el = s as HTMLElement;
			if (el.style.backgroundColor === currentColor || this.rgbToHex(el.style.backgroundColor) === currentColor) {
				el.classList.add('active');
			} else {
				el.classList.remove('active');
			}
		});
	}

	private rgbToHex(rgb: string): string {
		const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
		if (!match) return rgb;
		const r = parseInt(match[1]).toString(16).padStart(2, '0');
		const g = parseInt(match[2]).toString(16).padStart(2, '0');
		const b = parseInt(match[3]).toString(16).padStart(2, '0');
		return `#${r}${g}${b}`.toUpperCase();
	}

	private updateActiveStates(): void {
		for (const [type, btn] of this.toolButtons) {
			if (type === this.toolState.activeTool) {
				btn.classList.add('active');
			} else {
				btn.classList.remove('active');
			}
		}

		// Rebuild color swatches when switching between pen/highlighter
		const colorWrapper = this.containerEl.querySelector('.color-picker-wrapper');
		if (colorWrapper) {
			this.buildColorSwatches(colorWrapper as HTMLElement);
		}
	}

	destroy(): void {
		this.containerEl.remove();
	}
}
