import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN } from '../../src/i18n/en';
import { getLocale, initI18n, t } from '../../src/i18n/index';

/** 递归收集 src 目录下的 .ts 文件（排除 i18n 目录自身）。 */
function collectTsFiles(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		const stat = statSync(full);
		if (stat.isDirectory()) {
			if (name === 'i18n') continue;
			collectTsFiles(full, out);
		} else if (name.endsWith('.ts')) {
			out.push(full);
		}
	}
	return out;
}

const SRC_DIR = join(__dirname, '..', '..', 'src');

/** 从源码中提取所有 t('...') / t("...") 的首参键。 */
function extractTKeys(): string[] {
	const keys = new Set<string>();
	for (const file of collectTsFiles(SRC_DIR)) {
		const content = readFileSync(file, 'utf-8');
		const re = /\bt\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
		let match: RegExpExecArray | null;
		while ((match = re.exec(content)) !== null) {
			const raw = match[1];
			// 反转义源码字面量：\' \" \\n（与 TS 字符串解析一致，保证与运行时词典键可比）
			keys.add(raw.slice(1, -1)
				.replace(/\\'/g, '\'')
				.replace(/\\"/g, '"')
				.replace(/\\n/g, '\n')
				.replace(/\\\\/g, '\\'));
		}
	}
	return [...keys];
}

describe('i18n 词典覆盖', () => {
	it('源码中每个 t() 键都有英文翻译', () => {
		const keys = extractTKeys();
		expect(keys.length).toBeGreaterThan(50);
		const missing = keys.filter((key) => EN[key] === undefined);
		expect(missing, `缺少英文翻译的键：${missing.join(' | ')}`).toEqual([]);
	});

	it('词典值不为空且不等于键（避免无意义词条）', () => {
		for (const [key, value] of Object.entries(EN)) {
			expect(value.trim().length, `键 "${key}" 的翻译为空`).toBeGreaterThan(0);
		}
	});
});

describe('i18n 运行时', () => {
	it('zh 环境直接返回键本身', () => {
		initI18n('zh');
		expect(t('关闭')).toBe('关闭');
	});

	it('en 环境查词典，缺失回退键本身', () => {
		initI18n('en');
		expect(t('关闭')).toBe('Close');
		expect(t('不存在的设计键')).toBe('不存在的设计键');
		initI18n('zh');
	});

	it('vars 填充 {name} 占位符，未提供的占位符原样保留', () => {
		initI18n('en');
		expect(t('{n} 个文件将被永久删除。', { n: 3 })).toBe('3 files will be permanently deleted.');
		expect(t('目标：{dir}')).toBe('Target: {dir}');
		initI18n('zh');
		expect(t('{n} 个文件将被永久删除。', { n: 3 })).toBe('3 个文件将被永久删除。');
	});

	it('非法语言设置回退 auto', () => {
		initI18n('xx' as never);
		// auto 模式下跟随检测（测试环境无 localStorage → zh）
		expect(getLocale()).toBe('zh');
		initI18n('zh');
	});

	it('覆盖设置为 en 时无视环境检测', () => {
		initI18n('en');
		expect(getLocale()).toBe('en');
		expect(t('取消')).toBe('Cancel');
		initI18n('zh');
	});
});
