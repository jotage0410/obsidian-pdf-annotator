import { Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE } from './constants';
import { PDFAnnotatorView } from './pdf-view';
import { PDFAnnotatorSettingTab, DEFAULT_SETTINGS } from './settings';
import type { PDFAnnotatorSettings } from './settings';

export default class PDFAnnotatorPlugin extends Plugin {
	settings: PDFAnnotatorSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// Register the custom PDF view
		this.registerView(VIEW_TYPE, (leaf) => new PDFAnnotatorView(leaf));

		// Register to handle .pdf files
		this.registerExtensions(['pdf'], VIEW_TYPE);

		// Add settings tab
		this.addSettingTab(new PDFAnnotatorSettingTab(this.app, this));

		// Add ribbon icon to open PDF
		this.addRibbonIcon('pencil', 'Pencil - Open PDF', () => {
			const pdfFiles = this.app.vault.getFiles().filter(f => f.extension === 'pdf');
			if (pdfFiles.length > 0) {
				this.openPDF(pdfFiles[0]);
			}
		});

		// Command to open PDF in annotator
		this.addCommand({
			id: 'open-pdf-pencil',
			name: 'Open current PDF in Pencil',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (file?.extension === 'pdf') {
					if (!checking) {
						this.openPDF(file);
					}
					return true;
				}
				return false;
			},
		});
	}

	async openPDF(file: TFile): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);

		let leaf: WorkspaceLeaf;
		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			const activeLeaf = this.app.workspace.getLeaf(false);
			leaf = activeLeaf ?? this.app.workspace.getLeaf(true);
		}

		await leaf.setViewState({
			type: VIEW_TYPE,
			active: true,
		});

		const view = leaf.view as PDFAnnotatorView;
		if (view && view.loadFile) {
			await view.loadFile(file);
		}

		this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async onunload() {
		// Obsidian handles cleanup of registered views, commands, etc.
	}
}
