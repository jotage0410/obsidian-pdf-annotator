import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const MAX_CACHED_PAGES = 10;
const BUFFER_PAGES = 1;

export class PDFRenderer {
	private containerEl: HTMLElement;
	private pdfDoc: PDFDocumentProxy | null = null;
	private pageWrappers: Map<number, HTMLElement> = new Map();
	private renderedPages: Set<number> = new Set();
	private renderingPages: Set<number> = new Set();
	private visiblePages: Set<number> = new Set();
	private pageViewports: Map<number, { width: number; height: number }> = new Map();
	private observer: IntersectionObserver | null = null;
	private scale = 1.5;
	private renderGeneration: Map<number, number> = new Map();
	private onPageReady: ((pageIndex: number, wrapper: HTMLElement, viewport: { width: number; height: number }) => void) | null = null;
	private onPageEvicted: ((pageIndex: number) => void) | null = null;

	constructor(containerEl: HTMLElement) {
		this.containerEl = containerEl;
	}

	setOnPageReady(cb: (pageIndex: number, wrapper: HTMLElement, viewport: { width: number; height: number }) => void) {
		this.onPageReady = cb;
	}

	setOnPageEvicted(cb: (pageIndex: number) => void) {
		this.onPageEvicted = cb;
	}

	async loadPDF(data: ArrayBuffer): Promise<void> {
		// Use fake worker (main thread) - avoids worker file configuration issues in Obsidian
		if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
			pdfjsLib.GlobalWorkerOptions.workerSrc = '';
		}
		const loadingTask = pdfjsLib.getDocument({
			data,
			useWorkerFetch: false,
			isEvalSupported: false,
			useSystemFonts: true,
		});
		this.pdfDoc = await loadingTask.promise;
		await this.createPageContainers();
		this.setupIntersectionObserver();
	}

	private async createPageContainers(): Promise<void> {
		if (!this.pdfDoc) return;

		for (let i = 0; i < this.pdfDoc.numPages; i++) {
			// Get actual page dimensions for accurate placeholder size
			const page = await this.pdfDoc.getPage(i + 1);
			const viewport = page.getViewport({ scale: this.scale });
			this.pageViewports.set(i, { width: viewport.width, height: viewport.height });

			const wrapper = document.createElement('div');
			wrapper.className = 'pdf-page-wrapper';
			wrapper.dataset.pageIndex = String(i);
			wrapper.style.width = `${viewport.width}px`;
			wrapper.style.height = `${viewport.height}px`;

			const placeholder = document.createElement('div');
			placeholder.className = 'pdf-page-placeholder';
			placeholder.textContent = `Page ${i + 1}`;
			placeholder.style.height = '100%';
			placeholder.style.width = '100%';
			wrapper.appendChild(placeholder);

			this.containerEl.appendChild(wrapper);
			this.pageWrappers.set(i, wrapper);
		}
	}

	private setupIntersectionObserver(): void {
		this.observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const pageIndex = Number((entry.target as HTMLElement).dataset.pageIndex);
					if (entry.isIntersecting) {
						this.visiblePages.add(pageIndex);
						// Render this page + buffer
						this.renderPageWithBuffer(pageIndex);
					} else {
						this.visiblePages.delete(pageIndex);
					}
				}
				this.evictDistantPages();
			},
			{
				root: this.containerEl,
				rootMargin: '500px',
			}
		);

		for (const wrapper of this.pageWrappers.values()) {
			this.observer.observe(wrapper);
		}
	}

	private renderPageWithBuffer(pageIndex: number): void {
		for (let offset = -BUFFER_PAGES; offset <= BUFFER_PAGES; offset++) {
			const idx = pageIndex + offset;
			if (idx >= 0 && idx < (this.pdfDoc?.numPages ?? 0) && !this.renderedPages.has(idx)) {
				this.renderPage(idx);
			}
		}
	}

	private evictDistantPages(): void {
		if (this.renderedPages.size <= MAX_CACHED_PAGES) return;

		// Find the center of visible pages
		const visibleArr = [...this.visiblePages];
		if (visibleArr.length === 0) return;
		const center = visibleArr.reduce((a, b) => a + b, 0) / visibleArr.length;

		// Sort rendered pages by distance from center (furthest first)
		const rendered = [...this.renderedPages].sort(
			(a, b) => Math.abs(b - center) - Math.abs(a - center)
		);

		// Evict furthest pages until under limit, but never evict visible or buffer pages
		let evicted = 0;
		for (const pageToEvict of rendered) {
			if (this.renderedPages.size - evicted <= MAX_CACHED_PAGES) break;

			// Don't evict visible pages or their buffers
			if (this.visiblePages.has(pageToEvict)) continue;

			let isBuffer = false;
			for (const vp of this.visiblePages) {
				if (Math.abs(pageToEvict - vp) <= BUFFER_PAGES) {
					isBuffer = true;
					break;
				}
			}
			if (isBuffer) continue;

			const wrapper = this.pageWrappers.get(pageToEvict);
			if (wrapper) {
				const vp = this.pageViewports.get(pageToEvict);
				// Replace with placeholder, keeping dimensions
				wrapper.innerHTML = '';
				const placeholder = document.createElement('div');
				placeholder.className = 'pdf-page-placeholder';
				placeholder.textContent = `Page ${pageToEvict + 1}`;
				placeholder.style.height = '100%';
				placeholder.style.width = '100%';
				wrapper.appendChild(placeholder);

				// Keep wrapper dimensions from viewport
				if (vp) {
					wrapper.style.width = `${vp.width}px`;
					wrapper.style.height = `${vp.height}px`;
				}
			}
			this.renderedPages.delete(pageToEvict);
			// Bump generation to cancel any in-flight renders
			this.renderGeneration.set(pageToEvict, (this.renderGeneration.get(pageToEvict) ?? 0) + 1);
			this.onPageEvicted?.(pageToEvict);
			evicted++;
		}
	}

	private async renderPage(pageIndex: number): Promise<void> {
		if (!this.pdfDoc || this.renderedPages.has(pageIndex) || this.renderingPages.has(pageIndex)) return;
		this.renderingPages.add(pageIndex);

		// Increment generation to detect stale renders
		const generation = (this.renderGeneration.get(pageIndex) ?? 0) + 1;
		this.renderGeneration.set(pageIndex, generation);

		try {
			const page = await this.pdfDoc.getPage(pageIndex + 1);

			// Check if this render is still current (not evicted while loading)
			if (this.renderGeneration.get(pageIndex) !== generation) return;

			const viewport = page.getViewport({ scale: this.scale });
			const dpr = window.devicePixelRatio || 1;

			const wrapper = this.pageWrappers.get(pageIndex);
			if (!wrapper) return;

			wrapper.innerHTML = '';
			wrapper.style.width = `${viewport.width}px`;
			wrapper.style.height = `${viewport.height}px`;

			// Create PDF canvas
			const canvas = document.createElement('canvas');
			canvas.className = 'pdf-canvas';
			canvas.width = viewport.width * dpr;
			canvas.height = viewport.height * dpr;
			canvas.style.width = `${viewport.width}px`;
			canvas.style.height = `${viewport.height}px`;

			const ctx = canvas.getContext('2d');
			if (!ctx) {
				console.warn('Pencil: Failed to get 2D context for page', pageIndex + 1);
				return;
			}
			ctx.scale(dpr, dpr);

			wrapper.appendChild(canvas);

			// Create text layer
			const textLayerDiv = document.createElement('div');
			textLayerDiv.className = 'text-layer';
			wrapper.appendChild(textLayerDiv);

			// Render PDF page to canvas
			await page.render({ canvasContext: ctx, viewport }).promise;

			// Check if still current after render
			if (this.renderGeneration.get(pageIndex) !== generation) return;

			// Render text layer for text selection
			try {
				const textContent = await page.getTextContent();
				// Use TextLayer API (pdfjs-dist v4+)
				if ((pdfjsLib as any).TextLayer) {
					const textLayer = new (pdfjsLib as any).TextLayer({
						textContentSource: textContent,
						container: textLayerDiv,
						viewport,
					});
					await textLayer.render();
				} else if ((pdfjsLib as any).renderTextLayer) {
					// Fallback for older versions
					await (pdfjsLib as any).renderTextLayer({
						textContent,
						container: textLayerDiv,
						viewport,
					}).promise;
				}
			} catch (e) {
				console.warn('Pencil: Failed to render text layer for page', pageIndex + 1, e);
			}

			// Final generation check before creating annotation layer
			if (this.renderGeneration.get(pageIndex) !== generation) return;

			// Create annotation layer
			const annotationLayer = document.createElement('div');
			annotationLayer.className = 'annotation-layer';
			wrapper.appendChild(annotationLayer);

			this.renderedPages.add(pageIndex);

			if (this.onPageReady) {
				this.onPageReady(pageIndex, wrapper, {
					width: viewport.width,
					height: viewport.height,
				});
			}
		} catch (e) {
			console.error('Pencil: Failed to render page', pageIndex + 1, e);
		} finally {
			this.renderingPages.delete(pageIndex);
		}
	}

	getPageCount(): number {
		return this.pdfDoc?.numPages ?? 0;
	}

	getPageWrapper(pageIndex: number): HTMLElement | undefined {
		return this.pageWrappers.get(pageIndex);
	}

	destroy(): void {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		if (this.pdfDoc) {
			this.pdfDoc.destroy();
			this.pdfDoc = null;
		}
		this.pageWrappers.clear();
		this.renderedPages.clear();
		this.visiblePages.clear();
		this.pageViewports.clear();
		this.renderingPages.clear();
		this.renderGeneration.clear();
	}
}
