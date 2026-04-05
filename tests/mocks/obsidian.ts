export class Notice {
	message: string;

	constructor(message: string) {
		this.message = message;
	}
}

export class TAbstractFile {
	path: string;

	constructor(path: string) {
		this.path = path;
	}
}

export class TFile extends TAbstractFile {
	extension: string;

	constructor(path: string, extension: string) {
		super(path);
		this.extension = extension;
	}
}

export interface Editor {
	getSelection(): string;
}

export class Menu {
	addItem(): this {
		return this;
	}

	addSeparator(): this {
		return this;
	}
}
