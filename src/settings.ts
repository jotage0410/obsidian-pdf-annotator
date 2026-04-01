import { App, PluginSettingTab, Setting } from 'obsidian';
import type PDFAnnotatorPlugin from './main';
import type { InputMode, ToolType } from './types';

export interface PDFAnnotatorSettings {
	defaultTool: ToolType;
	defaultPenColor: string;
	defaultPenWidth: number;
	defaultHighlighterColor: string;
	defaultHighlighterWidth: number;
	palmRejection: boolean;
	inputMode: InputMode;
	autoSave: boolean;
	autoSaveDelay: number;
	eraserRadius: number;
	showHoverCursor: boolean;
	pressureSensitivity: number;
}

export const DEFAULT_SETTINGS: PDFAnnotatorSettings = {
	defaultTool: 'pen',
	defaultPenColor: '#000000',
	defaultPenWidth: 3,
	defaultHighlighterColor: '#FFFF00',
	defaultHighlighterWidth: 20,
	palmRejection: true,
	inputMode: 'pen-priority',
	autoSave: true,
	autoSaveDelay: 2000,
	eraserRadius: 20,
	showHoverCursor: true,
	pressureSensitivity: 1.0,
};

export class PDFAnnotatorSettingTab extends PluginSettingTab {
	plugin: PDFAnnotatorPlugin;

	constructor(app: App, plugin: PDFAnnotatorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Pencil Settings' });

		// Default tool
		new Setting(containerEl)
			.setName('Default tool')
			.setDesc('Tool selected when opening a PDF')
			.addDropdown(dropdown => dropdown
				.addOption('pen', 'Pen')
				.addOption('highlighter', 'Highlighter')
				.addOption('pan', 'Pan / Scroll')
				.setValue(this.plugin.settings.defaultTool)
				.onChange(async (value) => {
					this.plugin.settings.defaultTool = value as ToolType;
					await this.plugin.saveSettings();
				}));

		// Input mode
		new Setting(containerEl)
			.setName('Input mode')
			.setDesc('How touch and pen inputs are handled')
			.addDropdown(dropdown => dropdown
				.addOption('pen-priority', 'Pen priority (pen draws, touch scrolls)')
				.addOption('touch-draw', 'Touch draw (both pen and touch draw)')
				.addOption('pen-only', 'Pen only (only pen can draw)')
				.setValue(this.plugin.settings.inputMode)
				.onChange(async (value) => {
					this.plugin.settings.inputMode = value as InputMode;
					await this.plugin.saveSettings();
				}));

		// Palm rejection
		new Setting(containerEl)
			.setName('Palm rejection')
			.setDesc('Ignore touch input when pen is active')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.palmRejection)
				.onChange(async (value) => {
					this.plugin.settings.palmRejection = value;
					await this.plugin.saveSettings();
				}));

		// Default pen color
		new Setting(containerEl)
			.setName('Default pen color')
			.addColorPicker(picker => picker
				.setValue(this.plugin.settings.defaultPenColor)
				.onChange(async (value) => {
					this.plugin.settings.defaultPenColor = value;
					await this.plugin.saveSettings();
				}));

		// Default pen width
		new Setting(containerEl)
			.setName('Default pen width')
			.setDesc('Width in pixels (1-10)')
			.addSlider(slider => slider
				.setLimits(1, 10, 1)
				.setValue(this.plugin.settings.defaultPenWidth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.defaultPenWidth = value;
					await this.plugin.saveSettings();
				}));

		// Default highlighter color
		new Setting(containerEl)
			.setName('Default highlighter color')
			.addColorPicker(picker => picker
				.setValue(this.plugin.settings.defaultHighlighterColor)
				.onChange(async (value) => {
					this.plugin.settings.defaultHighlighterColor = value;
					await this.plugin.saveSettings();
				}));

		// Eraser radius
		new Setting(containerEl)
			.setName('Eraser radius')
			.setDesc('Size of the eraser in pixels (5-50)')
			.addSlider(slider => slider
				.setLimits(5, 50, 1)
				.setValue(this.plugin.settings.eraserRadius)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.eraserRadius = value;
					await this.plugin.saveSettings();
				}));

		// Show hover cursor
		new Setting(containerEl)
			.setName('Show hover cursor')
			.setDesc('Display a preview circle when the pen hovers')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showHoverCursor)
				.onChange(async (value) => {
					this.plugin.settings.showHoverCursor = value;
					await this.plugin.saveSettings();
				}));

		// Pressure sensitivity
		new Setting(containerEl)
			.setName('Pressure sensitivity')
			.setDesc('Multiplier for pressure input (0.5 = lighter, 2.0 = heavier)')
			.addSlider(slider => slider
				.setLimits(0.5, 2.0, 0.1)
				.setValue(this.plugin.settings.pressureSensitivity)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.pressureSensitivity = value;
					await this.plugin.saveSettings();
				}));

		// Auto-save
		new Setting(containerEl)
			.setName('Auto-save')
			.setDesc('Automatically save annotations after changes')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSave)
				.onChange(async (value) => {
					this.plugin.settings.autoSave = value;
					await this.plugin.saveSettings();
				}));
	}
}
