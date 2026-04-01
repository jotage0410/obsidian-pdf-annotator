export const PLUGIN_ID = 'pencil';
export const VIEW_TYPE = 'pencil-view';

export const DEFAULT_PEN_COLOR = '#000000';
export const DEFAULT_PEN_WIDTH = 3;
export const DEFAULT_HIGHLIGHTER_COLOR = '#FFFF00';
export const DEFAULT_HIGHLIGHTER_WIDTH = 20;
export const DEFAULT_ERASER_RADIUS = 20;

export const COLOR_PRESETS = [
	'#000000', // black
	'#FF0000', // red
	'#0066FF', // blue
	'#00AA00', // green
	'#FF6600', // orange
	'#9933FF', // purple
	'#FF69B4', // pink
	'#666666', // gray
];

export const HIGHLIGHTER_PRESETS = [
	'#FFFF00', // yellow
	'#00FF00', // green
	'#00CCFF', // cyan
	'#FF69B4', // pink
	'#FFA500', // orange
	'#DDA0DD', // plum
];

export const MIN_PEN_WIDTH = 1;
export const MAX_PEN_WIDTH = 10;

export const AUTOSAVE_DELAY_MS = 2000;
export const HISTORY_LIMIT = 50;

export const SCROLL_THRESHOLD = 20;

export const MAX_POINTS_PER_STROKE = 10000;
export const MAX_PDF_SIZE_MB = 200;

export const ANNOTATION_FILE_SUFFIX = '.annotations.json';
export const ANNOTATION_VERSION = 1;
