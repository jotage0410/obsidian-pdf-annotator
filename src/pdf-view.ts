import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import { VIEW_TYPE } from './constants';
import { PDFRenderer } from './pdf-renderer';
import { AnnotationCanvas } from './annotation-canvas';
import { InputManager } from './input-manager';
import { ToolState } from './tool-state';
import { Toolbar } from './toolbar';
import { HistoryManager } from './history';
import { AnnotationStorage } from './storage';
import type { Stroke } from './types';
import styles from './styles.css';

export class PDFAnnotatorView extends ItemView {
	private renderer: PDFRenderer | null = null;
	private file: TFile | null = null;
	private styleEl: HTMLStyleElement | null = null;
	private annotationCanvases: Map<number, AnnotationCanvas> = new Map();
	private inputManager: InputManager = new InputManager();
	private toolState: ToolState = new ToolState();
	private toolbar: Toolbar | null = null;
	private historyManager: HistoryManager = new HistoryManager();
	private storage: AnnotationStorage | null = null;
	private boundKeyHandler: ((e: KeyboardEvent) => void) | null = null;
	private toastEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Pencil';
	}

	getIcon(): string {
		return 'pencil';
	}

	async onOpen(): Promise<void> {
		// Inject styles
		this.styleEl = document.createElement('style');
		this.styleEl.textContent = styles;
		document.head.appendChild(this.styleEl);

		const container = this.contentEl;
		container.empty();
		container.addClass('pdf-annotator-container');
	}

	async setState(state: any, result: any): Promise<void> {
		if (state.file) {
			const file = this.app.vault.getAbstractFileByPath(state.file);
			if (file instanceof TFile) {
				await this.loadFile(file);
			}
		}
		await super.setState(state, result);
	}

	getState(): any {
		const state = super.getState();
		if (this.file) {
			state.file = this.file.path;
		}
		return state;
	}

	async loadFile(file: TFile): Promise<void> {
		// Clean up previous state if reloading
		await this.cleanup();

		this.file = file;
		// Update the tab header to show the file name
		(this.leaf as any).updateHeader?.();

		const container = this.contentEl;
		container.empty();
		container.addClass('pdf-annotator-container');

		// Use contentEl directly as scroll container (avoid nesting overflow containers)
		const scrollContainer = container;

		// Create toast element
		this.toastEl = document.createElement('div');
		this.toastEl.className = 'pdf-annotator-toast';
		this.toastEl.textContent = 'Saved';
		document.body.appendChild(this.toastEl);

		// Create toolbar
		this.toolbar = new Toolbar(scrollContainer, this.toolState);
		this.toolbar.setOnUndo(() => this.historyManager.undo());
		this.toolbar.setOnRedo(() => this.historyManager.redo());

		// Initialize storage
		this.storage = new AnnotationStorage(this.app, file.path);
		this.storage.setOnSaved(() => this.showToast('Saved'));

		// Load existing annotations
		const annotationData = await this.storage.load();

		// Compute PDF hash
		const pdfData = await this.app.vault.readBinary(file);
		const hash = await this.storage.computePdfHash(pdfData);
		if (annotationData.pdfHash && annotationData.pdfHash !== hash && annotationData.pdfHash !== 'unknown') {
			console.warn('Pencil: PDF has been modified since annotations were saved');
		}
		this.storage.setPdfHash(hash);

		// Set up history manager
		this.historyManager.setApplyAction((action, isUndo) => {
			const canvas = this.annotationCanvases.get(action.pageIndex);
			if (!canvas) return;

			if (isUndo) {
				if (action.type === 'add-stroke') {
					canvas.removeStroke((action.data as Stroke).id);
				} else if (action.type === 'remove-stroke') {
					canvas.addStroke(action.data as Stroke);
				}
			} else {
				if (action.type === 'add-stroke') {
					canvas.addStroke(action.data as Stroke);
				} else if (action.type === 'remove-stroke') {
					canvas.removeStroke((action.data as Stroke).id);
				}
			}

			// Persist after undo/redo
			this.persistPage(action.pageIndex);
		});

		// Keyboard shortcuts
		this.boundKeyHandler = (e: KeyboardEvent) => {
			// Don't handle if focused on input elements
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

			if (e.ctrlKey || e.metaKey) {
				if (e.key === 'z' && !e.shiftKey) {
					e.preventDefault();
					this.historyManager.undo();
				} else if ((e.key === 'z' && e.shiftKey) || e.key === 'Z') {
					e.preventDefault();
					this.historyManager.redo();
				}
			} else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
				// Tool shortcuts (single key, no modifiers)
				switch (e.key.toLowerCase()) {
					case 'p': this.toolState.setTool('pen'); break;
					case 'h': this.toolState.setTool('highlighter'); break;
					case 'e': this.toolState.setTool('eraser'); break;
					case 't': this.toolState.setTool('text-highlight'); break;
					case 'v': this.toolState.setTool('pan'); break;
				}
			}
		};
		document.addEventListener('keydown', this.boundKeyHandler);

		// Sync tool state changes to all annotation canvases
		this.toolState.on(() => {
			for (const canvas of this.annotationCanvases.values()) {
				canvas.setTool(this.toolState.activeTool as 'pen' | 'highlighter' | 'eraser' | 'pan' | 'text-highlight');
				canvas.setColor(this.toolState.getCurrentColor());
				canvas.setWidth(this.toolState.getCurrentWidth());
			}
		});

		// Initialize renderer
		this.renderer = new PDFRenderer(scrollContainer);

		// Set up annotation canvases when pages render
		this.renderer.setOnPageReady((pageIndex, wrapper, viewport) => {
			const annotationLayer = wrapper.querySelector('.annotation-layer') as HTMLElement;
			if (!annotationLayer) return;

			const annotCanvas = new AnnotationCanvas(
				annotationLayer,
				pageIndex,
				viewport.width,
				viewport.height,
				this.inputManager,
			);

			// Apply current tool state
			annotCanvas.setTool(this.toolState.activeTool as 'pen' | 'highlighter' | 'eraser' | 'pan' | 'text-highlight');
			annotCanvas.setColor(this.toolState.getCurrentColor());
			annotCanvas.setWidth(this.toolState.getCurrentWidth());

			// Load saved annotations for this page
			if (this.storage) {
				const pageData = this.storage.getPageAnnotations(pageIndex);
				if (pageData.strokes.length > 0) {
					annotCanvas.loadStrokes(pageData.strokes);
				}
				if (pageData.textHighlights.length > 0) {
					annotCanvas.loadTextHighlights(pageData.textHighlights);
				}
			}

			// Connect to history manager + storage
			annotCanvas.setOnStrokeAdded((stroke, pi) => {
				this.historyManager.push({ type: 'add-stroke', pageIndex: pi, data: stroke });
				this.persistPage(pi);
			});
			annotCanvas.setOnStrokeRemoved((stroke, pi) => {
				this.historyManager.push({ type: 'remove-stroke', pageIndex: pi, data: stroke });
				this.persistPage(pi);
			});

			this.annotationCanvases.set(pageIndex, annotCanvas);
		});

		await this.renderer.loadPDF(pdfData);
	}

	private persistPage(pageIndex: number): void {
		if (!this.storage) return;
		const canvas = this.annotationCanvases.get(pageIndex);
		if (!canvas) return;

		this.storage.setPageStrokes(pageIndex, canvas.getStrokes());
		this.storage.setPageTextHighlights(pageIndex, canvas.getTextHighlights());
	}

	private showToast(message: string): void {
		if (!this.toastEl) return;
		this.toastEl.textContent = message;
		this.toastEl.classList.add('visible');
		setTimeout(() => {
			this.toastEl?.classList.remove('visible');
		}, 1500);
	}

	private async cleanup(): Promise<void> {
		if (this.boundKeyHandler) {
			document.removeEventListener('keydown', this.boundKeyHandler);
			this.boundKeyHandler = null;
		}

		if (this.storage) {
			await this.storage.saveNow();
			this.storage.destroy();
			this.storage = null;
		}

		for (const canvas of this.annotationCanvases.values()) {
			canvas.destroy();
		}
		this.annotationCanvases.clear();

		this.historyManager.clear();

		if (this.toolbar) {
			this.toolbar.destroy();
			this.toolbar = null;
		}
		if (this.renderer) {
			this.renderer.destroy();
			this.renderer = null;
		}
		if (this.toastEl) {
			this.toastEl.remove();
			this.toastEl = null;
		}
	}

	async onClose(): Promise<void> {
		await this.cleanup();
		if (this.styleEl) {
			this.styleEl.remove();
			this.styleEl = null;
		}
	}
}
