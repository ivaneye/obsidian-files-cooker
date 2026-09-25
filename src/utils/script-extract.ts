/**
 * 从 Markdown 内容提取围栏代码块脚本。
 *
 * 职责说明：
 * - extractFencedBlocks：按语言白名单扫描围栏（``` / ~~~），非目标语言的围栏整体跳过（不误吞内容）；
 * - extractDataviewBlocks：```dataview 块（DQL；dataviewjs 是 JS，明确排除）；
 * - extractQueryBlocks：```query / ```search 块（Obsidian 嵌入搜索的保存形式）。
 * 全部为纯函数；未闭合围栏容忍为"编辑中"，取到文末。
 */

/** 逐行扫描围栏，提取目标语言代码块内容。 */
export function extractFencedBlocks(content: string, languages: ReadonlySet<string>): string[] {
	const blocks: string[] = [];
	const lines = content.split('\n');
	let i = 0;

	while (i < lines.length) {
		const openMatch = lines[i].match(/^\s*(`{3,}|~{3,})\s*(\S*)\s*$/);
		if (openMatch == null) {
			i++;
			continue;
		}

		const fence = openMatch[1];
		const lang = (openMatch[2] ?? '').toLowerCase();
		const body: string[] = [];
		i++;

		// 消费到长度不小于开栏的闭栏为止；目标语言才收集内容
		while (i < lines.length) {
			const closeMatch = lines[i].match(/^\s*(`{3,}|~{3,})\s*$/);
			if (closeMatch != null && closeMatch[1].length >= fence.length) {
				i++;
				break;
			}
			if (languages.has(lang)) {
				body.push(lines[i]);
			}
			i++;
		}

		if (languages.has(lang) && body.length > 0) {
			const text = body.join('\n').trim();
			if (text !== '') {
				blocks.push(text);
			}
		}
	}

	return blocks;
}

/** 提取 ```dataview 代码块（DQL 脚本；dataviewjs 为 JS，排除）。 */
export function extractDataviewBlocks(content: string): string[] {
	return extractFencedBlocks(content, new Set(['dataview']));
}

/** 提取 ```query / ```search 代码块（Obsidian 嵌入搜索查询）。 */
export function extractQueryBlocks(content: string): string[] {
	return extractFencedBlocks(content, new Set(['query', 'search']));
}
