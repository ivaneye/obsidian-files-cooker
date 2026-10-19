import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', async () => {
	return await import('../mocks/obsidian');
});

// 弹窗 mock：验证 Action 是否以正确参数打开 AiPropertiesModal
const openSpy = vi.hoisted(() => vi.fn());
vi.mock('src/modal/ai-properties-modal', async (importOriginal) => {
	const actual = await importOriginal<typeof import('src/modal/ai-properties-modal')>();
	// 仅替换 open 行为，保留类与纯函数
	return {
		...actual,
		AiPropertiesModal: class extends actual.AiPropertiesModal {
			open(): void {
				openSpy(this);
			}
		},
	};
});

import { __getNotices, __resetNotices } from '../mocks/obsidian';
import { t } from 'src/i18n/index';
import { ActionModel } from 'src/action/action';
import { AiPropertiesAction } from 'src/action/ai-properties-action';
import { AiSettings, DEFAULT_AI_SETTINGS } from 'src/ai/ai-settings';
import type { TFile } from 'obsidian';

/**
 * 测试目的：验证 AiPropertiesAction 的前置检查与入口行为。
 * 测试内容：空集合阻断、未配置阻断（零弹窗零网络）、配置完整时打开提案弹窗。
 * 预期结果：阻断路径仅产生 Notice；放行路径以文件集合与依赖打开弹窗。
 */

/** 文件桩：编译期断言为 TFile，运行时普通对象（真实类型不允许外部构造）。 */
function mdFile(path: string): TFile {
	return { path, name: path.split('/').pop() ?? path, parent: null } as unknown as TFile;
}

function makePlugin(ai: Partial<AiSettings>, app?: unknown) {
	return {
		app: app ?? { vault: { getAbstractFileByPath: (): null => null } },
		settings: {
			ai: { ...DEFAULT_AI_SETTINGS, ...ai } as AiSettings,
		},
	} as never;
}

const configured: Partial<AiSettings> = {
	enabled: true,
	baseUrl: 'https://api.deepseek.com/v1',
	model: 'deepseek-chat',
	apiKey: 'sk-test',
};

beforeEach(() => {
	__resetNotices();
	openSpy.mockClear();
	(globalThis as any).localStorage = { getItem: vi.fn(() => null), setItem: vi.fn() };
});

describe('AiPropertiesAction', () => {

	it('空集合时阻断并提示', () => {
		const action = new AiPropertiesAction(makePlugin(configured));
		action.act([]);
		expect(__getNotices().some((n) => n.includes(t('未找到文件。')))).toBe(true);
		expect(openSpy).not.toHaveBeenCalled();
	});

	it('AI 未启用时阻断：零弹窗', () => {
		const action = new AiPropertiesAction(makePlugin({ enabled: false }));
		const models = [new ActionModel(mdFile('a.md'))];
		action.act(models);
		expect(__getNotices().some((n) => n.includes('AI'))).toBe(true);
		expect(openSpy).not.toHaveBeenCalled();
	});

	it('配置完整时以文件集合打开提案弹窗', () => {
		const action = new AiPropertiesAction(makePlugin(configured));
		const models = [new ActionModel(mdFile('a.md')), new ActionModel(mdFile('b.md'))];
		action.act(models);
		expect(openSpy).toHaveBeenCalledTimes(1);
		const modal = openSpy.mock.calls[0][0] as { files: TFile[] };
		expect(modal.files.map((f) => f.path)).toEqual(['a.md', 'b.md']);
	});

	it('Key 在 SecretStorage、明文为空时，Provider 拿到的是解析后的 Key（401 回归）', () => {
		// 模拟真实场景：SecretStorage 存了 Key，settings.apiKey 已被清空
		const app = {
			vault: {},
			secretStorage: { getSecret: () => 'sk-from-secret-storage' },
		};
		const action = new AiPropertiesAction(makePlugin({ ...configured, apiKey: '' }, app));
		action.act([new ActionModel(mdFile('a.md'))]);

		expect(openSpy).toHaveBeenCalledTimes(1);
		const modal = openSpy.mock.calls[0][0] as { deps: { settings: AiSettings } };
		// 若拿不到 SecretStorage 的 Key，这里会是空串 → 请求 401
		expect(modal.deps.settings.apiKey).toBe('sk-from-secret-storage');
	});
});
