/**
 * 轻量 i18n 层：
 * - 以中文文案为键（源语言），英文文案统一维护在 en.ts 词典；
 * - 默认跟随 Obsidian 界面语言（localStorage 'language'），可在设置中覆盖（auto / zh / en）；
 * - t(key, vars) 支持 {name} 占位符插值；
 * - 英文词典缺失或检测不可用时回退为键本身（中文），保证 UI 永远有文案可显示。
 */

import { EN } from './en';

export type Locale = 'zh' | 'en';
export type LanguageSetting = 'auto' | 'zh' | 'en';

let languageSetting: LanguageSetting = 'auto';

/** onload 时注入设置中的语言偏好；设置变更后再次调用即可立即生效。 */
export function initI18n(setting: LanguageSetting | undefined): void {
	languageSetting = setting === 'zh' || setting === 'en' ? setting : 'auto';
}

/** 当前生效语言：设置覆盖 > Obsidian 界面语言 > 中文（检测不可用时，如测试环境）。 */
export function getLocale(): Locale {
	if (languageSetting !== 'auto') return languageSetting;
	return detectLocale();
}

/** 从 Obsidian 的 localStorage 读取界面语言（如 'en' / 'zh'）；不可用时回退中文。 */
function detectLocale(): Locale {
	try {
		const lang = window.localStorage.getItem('language');
		if (!lang) return 'zh';
		return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
	} catch (e) {
		return 'zh';
	}
}

/**
 * 翻译：zh 环境直接返回键本身；en 环境查词典（缺失回退键本身）。
 * vars 用于填充文案中的 {name} 占位符，未提供的占位符原样保留。
 */
export function t(key: string, vars?: Record<string, string | number>): string {
	let text = key;
	if (getLocale() === 'en') {
		const entry = EN[key];
		if (entry !== undefined) text = entry;
	}
	if (!vars) return text;
	return text.replace(/\{(\w+)\}/g, (raw, name: string) =>
		Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : raw
	);
}
