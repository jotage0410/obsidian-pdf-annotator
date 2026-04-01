import { Plugin, TFile, WorkspaceLeaf, Notice } from 'obsidian';
import { VIEW_TYPE } from './constants';
import { PDFAnnotatorView } from './pdf-view';
import { PDFAnnotatorSettingTab, DEFAULT_SETTINGS } from './settings';
import type { PDFAnnotatorSettings } from './settings';

export default class PDFAnnotatorPlugin extends Plugin {
	settings: PDFAnnotatorSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// Register the custom PDF view
		this.registerView(VIEW_TYPE, (leaf) => {
			const view = new PDFAnnotatorView(leaf);
			view.setSettings(this.settings);
			return view;
		});

		// Register to handle .pdf files
		this.registerExtensions(['pdf'], VIEW_TYPE);

		// Add settings tab
		this.addSettingTab(new PDFAnnotatorSettingTab(this.app, this));

		// Add ribbon icon to open PDF
		this.addRibbonIcon('pencil', 'Pencil - Open PDF', () => {
			// Try to open the currently active file if it's a PDF
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile?.extension === 'pdf') {
				this.openPDF(activeFile);
				return;
			}

			// Otherwise show a notice
			new Notice('Select a PDF file to open with Pencil');
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
			state: { file: file.path },
		});

		// Pass updated settings to the view
		const view = leaf.view as PDFAnnotatorView;
		if (view && view.setSettings) {
			view.setSettings(this.settings);
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
