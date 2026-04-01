import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const MAX_CACHED_PAGES = 10;
const BUFFER_PAGES = 1;

export class PDFRenderer {
	private containerEl: HTMLElement;
	private pdfDoc: PDFDocumentProxy | null = null;
	private pageWrappers: Map<number, HTMLElement> = new Map();
	private renderedPages: Set<number> = new Set();
	private visiblePages: Set<number> = new Set();
	private pageViewports: Map<number, { width: number; height: number }> = new Map();
	private observer: IntersectionObserver | null = null;
	private scale = 1.5;
	private onPageReady: ((pageIndex: number, wrapper: HTMLElement, viewport: { width: number; height: number }) => void) | null = null;

	constructor(containerEl: HTMLElement) {
		this.containerEl = containerEl;
	}

	setOnPageReady(cb: (pageIndex: number, wrapper: HTMLElement, viewport: { width: number; height: number }) => void) {
		this.onPageReady = cb;
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

		// Sort rendered pages by distance from center
		const rendered = [...this.renderedPages].sort(
			(a, b) => Math.abs(b - center) - Math.abs(a - center)
		);

		// Evict furthest pages until under limit
		while (rendered.length > MAX_CACHED_PAGES) {
			const pageToEvict = rendered.shift()!;
			// Don't evict visible pages or buffer
			if (this.visiblePages.has(pageToEvict)) continue;

			const wrapper = this.pageWrappers.get(pageToEvict);
			if (wrapper) {
				const vp = this.pageViewports.get(pageToEvict);
				// Replace with placeholder, keeping dimensions
				wrapper.empty();
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
		}
	}

	private async renderPage(pageIndex: number): Promise<void> {
		if (!this.pdfDoc || this.renderedPages.has(pageIndex)) return;
		this.renderedPages.add(pageIndex);

		const page = await this.pdfDoc.getPage(pageIndex + 1);
		const viewport = page.getViewport({ scale: this.scale });
		const dpr = window.devicePixelRatio || 1;

		const wrapper = this.pageWrappers.get(pageIndex);
		if (!wrapper) return;

		wrapper.empty();
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
		if (!ctx) return;
		ctx.scale(dpr, dpr);

		wrapper.appendChild(canvas);

		const textLayerDiv = document.createElement('div');
		textLayerDiv.className = 'text-layer';
		wrapper.appendChild(textLayerDiv);

		const annotationLayer = document.createElement('div');
		annotationLayer.className = 'annotation-layer';
		wrapper.appendChild(annotationLayer);

		await page.render({ canvasContext: ctx, viewport }).promise;

		if (this.onPageReady) {
			this.onPageReady(pageIndex, wrapper, {
				width: viewport.width,
				height: viewport.height,
			});
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
	}
}
