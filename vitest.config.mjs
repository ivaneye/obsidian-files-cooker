import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
	},
	resolve: {
		alias: {
			src: resolve(process.cwd(), 'src'),
			main: resolve(process.cwd(), 'main.ts'),
			obsidian: resolve(process.cwd(), 'tests/mocks/obsidian.ts'),
		},
	},
});
