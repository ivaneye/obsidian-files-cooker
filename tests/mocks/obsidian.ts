type ElementOptions = {
	text?: string;
	cls?: string;
};

export class MockElement {
	tag: string;
	text = '';
	cls = '';
	children: MockElement[] = [];
	innerHTML = '';
	classList: {
		add: (...tokens: string[]) => void;
	};

	constructor(tag: string, options?: ElementOptions) {
		this.tag = tag;
		this.text = options?.text ?? '';
		this.cls = options?.cls ?? '';
		this.classList = {
			add: (...tokens: string[]) => {
				const classes = new Set(this.cls.split(' ').filter(Boolean));
				tokens.forEach((token) => classes.add(token));
				this.cls = Array.from(classes).join(' ');
			},
		};
	}

	createEl(tag: string, options?: ElementOptions): MockElement {
		const child = new MockElement(tag, options);
		this.children.push(child);
		return child;
	}

	createDiv(options?: ElementOptions): MockElement {
		return this.createEl('div', options);
	}

	empty(): void {
		this.children = [];
		this.innerHTML = '';
	}
}

const noticeMessages: string[] = [];

export class Notice {
	message: string;

	constructor(message: string) {
		this.message = message;
		noticeMessages.push(message);
	}
}

export function __getNotices(): string[] {
	return [...noticeMessages];
}

export function __resetNotices(): void {
	noticeMessages.length = 0;
}

export class TAbstractFile {
	path: string;
	name: string;
	parent: { path: string };

	constructor(path: string) {
		this.path = path;
		this.name = path.split('/').pop() ?? path;
		this.parent = {
			path: path.includes('/') ? path.split('/').slice(0, -1).join('/') : '',
		};
	}
}

export class TFile extends TAbstractFile {
	extension: string;

	constructor(path: string, extension = 'md') {
		super(path);
		this.extension = extension;
	}
}

export interface Editor {
	getSelection(): string;
}

export class Modal {
	app: any;
	contentEl: MockElement;
	isOpen = false;
	closed = false;

	constructor(app: any) {
		this.app = app;
		this.contentEl = new MockElement('div', { cls: 'modal-content' });
	}

	open(): void {
		this.isOpen = true;
		if (typeof (this as any).onOpen === 'function') {
			(this as any).onOpen();
		}
	}

	close(): void {
		this.closed = true;
		if (typeof (this as any).onClose === 'function') {
			(this as any).onClose();
		}
	}
}

export class ButtonComponent {
	buttonText = '';
	isCta = false;
	isWarning = false;
	onClickHandler?: () => void | Promise<void>;

	setButtonText(text: string): this {
		this.buttonText = text;
		return this;
	}

	setCta(): this {
		this.isCta = true;
		return this;
	}

	setWarning(): this {
		this.isWarning = true;
		return this;
	}

	onClick(handler: () => void | Promise<void>): this {
		this.onClickHandler = handler;
		return this;
	}

	async click(): Promise<void> {
		await this.onClickHandler?.();
	}
}

export class ToggleComponent {
	value = false;
	tooltip = '';
	onChangeHandler?: (val: boolean) => void;

	setTooltip(text: string): this {
		this.tooltip = text;
		return this;
	}

	setValue(value: boolean): this {
		this.value = value;
		return this;
	}

	onChange(handler: (val: boolean) => void): this {
		this.onChangeHandler = handler;
		return this;
	}

	trigger(value: boolean): void {
		this.value = value;
		this.onChangeHandler?.(value);
	}
}

export class TextComponent {
	placeholder = '';
	value = '';
	onChangeHandler?: (val: string) => void;

	setPlaceholder(text: string): this {
		this.placeholder = text;
		return this;
	}

	onChange(handler: (val: string) => void): this {
		this.onChangeHandler = handler;
		return this;
	}

	setValue(value: string): this {
		this.value = value;
		this.onChangeHandler?.(value);
		return this;
	}
}

export class Setting {
	static instances: Setting[] = [];
	el: MockElement;
	buttons: ButtonComponent[] = [];
	toggles: ToggleComponent[] = [];
	texts: TextComponent[] = [];

	constructor(el: MockElement) {
		this.el = el;
		Setting.instances.push(this);
	}

	addButton(cb: (btn: ButtonComponent) => void): this {
		const btn = new ButtonComponent();
		cb(btn);
		this.buttons.push(btn);
		return this;
	}

	addToggle(cb: (toggle: ToggleComponent) => void): this {
		const toggle = new ToggleComponent();
		cb(toggle);
		this.toggles.push(toggle);
		return this;
	}

	addText(cb: (text: TextComponent) => void): this {
		const text = new TextComponent();
		cb(text);
		this.texts.push(text);
		return this;
	}

	static reset(): void {
		Setting.instances = [];
	}
}

export class Menu {
	addItem(): this {
		return this;
	}

	addSeparator(): this {
		return this;
	}
}

export class ItemView {
	getViewType(): string {
		return '';
	}
}

export function requireApiVersion(): boolean {
	return true;
}
