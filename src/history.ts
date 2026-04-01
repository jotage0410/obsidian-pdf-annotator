import type { HistoryAction, Stroke, TextHighlight } from './types';
import { HISTORY_LIMIT } from './constants';

export class HistoryManager {
	private undoStack: HistoryAction[] = [];
	private redoStack: HistoryAction[] = [];

	// Callback to apply/revert actions on the annotation canvas
	private applyAction: ((action: HistoryAction, isUndo: boolean) => void) | null = null;

	setApplyAction(cb: (action: HistoryAction, isUndo: boolean) => void): void {
		this.applyAction = cb;
	}

	push(action: HistoryAction): void {
		this.undoStack.push(action);
		if (this.undoStack.length > HISTORY_LIMIT) {
			this.undoStack.shift();
		}
		// Clear redo stack on new action
		this.redoStack = [];
	}

	undo(): void {
		const action = this.undoStack.pop();
		if (!action) return;

		this.redoStack.push(action);
		if (this.applyAction) {
			this.applyAction(action, true);
		}
	}

	redo(): void {
		const action = this.redoStack.pop();
		if (!action) return;

		this.undoStack.push(action);
		if (this.applyAction) {
			this.applyAction(action, false);
		}
	}

	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	clear(): void {
		this.undoStack = [];
		this.redoStack = [];
	}
}
