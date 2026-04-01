import type { App } from 'obsidian';
import type { AnnotationData, PageAnnotations, Stroke, TextHighlight } from './types';
import { ANNOTATION_FILE_SUFFIX, ANNOTATION_VERSION, AUTOSAVE_DELAY_MS } from './constants';

export class AnnotationStorage {
	private app: App;
	private pdfPath: string;
	private annotationPath: string;
	private data: AnnotationData;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private isSaving = false;
	private pendingSave = false;
	private onSaved: (() => void) | null = null;
	private autoSaveDelay: number = AUTOSAVE_DELAY_MS;

	constructor(app: App, pdfPath: string) {
		this.app = app;
		this.pdfPath = pdfPath;
		this.annotationPath = pdfPath + ANNOTATION_FILE_SUFFIX;
		this.data = {
			version: ANNOTATION_VERSION,
			pdfHash: '',
			pages: {},
		};
	}

	setAutoSaveDelay(delay: number): void {
		this.autoSaveDelay = delay;
	}

	setOnSaved(cb: () => void): void {
		this.onSaved = cb;
	}

	async load(): Promise<AnnotationData> {
		try {
			const exists = await this.app.vault.adapter.exists(this.annotationPath);
			if (!exists) return this.data;

			const raw = await this.app.vault.adapter.read(this.annotationPath);
			const parsed = JSON.parse(raw);

			// Validate loaded data structure
			if (!this.isValidAnnotationData(parsed)) {
				console.warn('Pencil: Invalid annotation data format, starting fresh');
				return this.data;
			}

			this.data = parsed;
		} catch (e) {
			console.warn('Pencil: Failed to load annotations, starting fresh', e);
			// Backup corrupted file
			try {
				const exists = await this.app.vault.adapter.exists(this.annotationPath);
				if (exists) {
					const backupPath = this.annotationPath + '.backup';
					const raw = await this.app.vault.adapter.read(this.annotationPath);
					await this.app.vault.adapter.write(backupPath, raw);
				}
			} catch {
				// Ignore backup errors
			}
		}

		return this.data;
	}

	async computePdfHash(pdfData: ArrayBuffer): Promise<string> {
		try {
			const hashBuffer = await crypto.subtle.digest('SHA-256', pdfData);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
		} catch {
			return 'unknown';
		}
	}

	setPdfHash(hash: string): void {
		this.data.pdfHash = hash;
	}

	getPageAnnotations(pageIndex: number): PageAnnotations {
		const key = String(pageIndex);
		if (!this.data.pages[key]) {
			this.data.pages[key] = { strokes: [], textHighlights: [] };
		}
		return this.data.pages[key];
	}

	setPageStrokes(pageIndex: number, strokes: Stroke[]): void {
		const page = this.getPageAnnotations(pageIndex);
		page.strokes = strokes;
		this.scheduleSave();
	}

	setPageTextHighlights(pageIndex: number, highlights: TextHighlight[]): void {
		const page = this.getPageAnnotations(pageIndex);
		page.textHighlights = highlights;
		this.scheduleSave();
	}

	scheduleSave(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
		}
		this.saveTimer = setTimeout(() => this.save(), this.autoSaveDelay);
	}

	async save(): Promise<void> {
		// Prevent concurrent saves
		if (this.isSaving) {
			this.pendingSave = true;
			return;
		}
		this.isSaving = true;
		try {
			const json = JSON.stringify(this.data, null, 2);
			await this.app.vault.adapter.write(this.annotationPath, json);
			if (this.onSaved) {
				this.onSaved();
			}
		} catch (e) {
			console.error('Pencil: Failed to save annotations', e);
		} finally {
			this.isSaving = false;
			if (this.pendingSave) {
				this.pendingSave = false;
				this.scheduleSave();
			}
		}
	}

	private isValidAnnotationData(data: unknown): data is AnnotationData {
		if (typeof data !== 'object' || data === null) return false;
		const obj = data as Record<string, unknown>;
		if (typeof obj.version !== 'number') return false;
		if (typeof obj.pages !== 'object' || obj.pages === null) return false;
		// Validate each page has expected structure
		for (const [, page] of Object.entries(obj.pages as Record<string, unknown>)) {
			if (typeof page !== 'object' || page === null) return false;
			const p = page as Record<string, unknown>;
			if (!Array.isArray(p.strokes)) return false;
			if (!Array.isArray(p.textHighlights)) return false;
		}
		return true;
	}

	async saveNow(): Promise<void> {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		await this.save();
	}

	destroy(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
	}
}
