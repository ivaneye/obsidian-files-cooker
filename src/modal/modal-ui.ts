import { Notice, Setting } from 'obsidian';

type ModalLayoutOptions = {
	title: string;
	description?: string;
	summaryLines?: string[];
	listItems?: string[];
	listLabel?: string;
	emptyMessage?: string;
	variant?: 'danger' | 'confirm' | 'input';
};

type ModalAction = {
	text: string;
	cta?: boolean;
	warning?: boolean;
	onClick: () => void | Promise<void>;
};

export function renderModalLayout(contentEl: HTMLElement, options: ModalLayoutOptions): void {
	contentEl.classList.add('file-cooker-modal');
	if (options.variant) {
		contentEl.classList.add(`file-cooker-modal--${options.variant}`);
	}

	contentEl.createEl('h1', { text: options.title, cls: 'file-cooker-modal__title' });

	if (options.description) {
		contentEl.createDiv({ text: options.description, cls: 'file-cooker-modal__description' });
	}

	if (options.summaryLines && options.summaryLines.length > 0) {
		const summaryEl = contentEl.createDiv({ cls: 'file-cooker-modal__summary' });
		options.summaryLines.forEach((line) => {
			summaryEl.createDiv({ text: line, cls: 'file-cooker-modal__summary-line' });
		});
	}

	if (options.listItems && options.listItems.length > 0) {
		if (options.listLabel) {
			contentEl.createDiv({ text: options.listLabel, cls: 'file-cooker-modal__section-label' });
		}
		const listEl = contentEl.createDiv({ cls: 'file-cooker-modal__list' });
		options.listItems.forEach((line, idx) => {
			const row = listEl.createDiv({ cls: 'file-cooker-modal__list-item' });
			row.createDiv({ text: `#${idx + 1}`, cls: 'file-cooker-modal__list-index' });
			row.createDiv({ text: line, cls: 'file-cooker-modal__list-text' });
		});
		return;
	}

	if (options.emptyMessage) {
		contentEl.createDiv({ text: options.emptyMessage, cls: 'file-cooker-modal__empty' });
	}
}

export function addModalActions(contentEl: HTMLElement, actions: ModalAction[]): void {
	const actionSetting = new Setting(contentEl);
	actions.forEach((action) => {
		actionSetting.addButton((btn) => {
			btn.setButtonText(action.text);
			if (action.cta) {
				btn.setCta();
			}
			if (action.warning) {
				btn.setWarning();
			}
			btn.onClick(action.onClick);
		});
	});
}

export function isBlank(value?: string): boolean {
	return value == null || value.trim() === '';
}

export function showValidationNotice(message: string): void {
	new Notice(message);
}

/**
 * 属性值类型解析：true/false（忽略大小写）→ 布尔值，其余保持字符串原样。
 * 避免 YAML 将字符串 "true" 加引号序列化（key: "true"），破坏 Obsidian 的 Checkbox 属性。
 */
export function parseScalarInput(value: string): string | boolean {
	const normalized = value.trim().toLowerCase();
	if (normalized === 'true') {
		return true;
	}
	if (normalized === 'false') {
		return false;
	}
	return value;
}

export function addLabeledTextField(
	contentEl: HTMLElement,
	label: string,
	placeholder: string,
	onChange: (value: string) => void
): void {
	const fieldRow = contentEl.createDiv({ cls: 'file-cooker-modal__field-row' });
	fieldRow.createDiv({ text: label, cls: 'file-cooker-modal__field-label' });

	new Setting(fieldRow).addText((txt) => {
		txt.setPlaceholder(placeholder).onChange((val) => {
			onChange(val);
		});
	});
}

export function addLabeledToggleField(
	contentEl: HTMLElement,
	label: string,
	tooltip: string,
	initialValue: boolean,
	onChange: (value: boolean) => void
): void {
	const fieldRow = contentEl.createDiv({ cls: 'file-cooker-modal__field-row' });
	fieldRow.createDiv({ text: label, cls: 'file-cooker-modal__field-label' });

	new Setting(fieldRow).addToggle((toggle) => {
		toggle.setValue(initialValue).setTooltip(tooltip).onChange((val) => {
			onChange(val);
		});
	});
}
