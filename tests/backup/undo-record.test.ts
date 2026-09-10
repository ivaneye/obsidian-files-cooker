import { describe, expect, it } from 'vitest';
import { parseRecords, serializeRecords } from 'src/backup/undo-record';
import type { UndoRecord } from 'src/backup/undo-record';

/**
 * 测试目的：验证 undo-record 数据模型的序列化/解析行为。
 * 测试内容：manifest 序列化/解析往返一致性、非法/损坏 JSON 的降级解析、记录状态字段保留、FileChange 各 kind 字段校验。
 * 预期结果：有效记录往返一致；损坏输入返回空列表；非法记录被过滤。
 */

function makeRecord(overrides: Partial<UndoRecord> = {}): UndoRecord {
	return {
		id: 'rec-1',
		time: 1700000000000,
		opType: 'properties',
		opLabel: 'Edit properties',
		status: 'active',
		files: [{ kind: 'content', path: 'a.md', beforeBlob: 'f-0.before.md', afterBlob: 'f-0.after.md' }],
		...overrides,
	};
}

describe('undo-record 序列化与解析', () => {
	it('序列化→解析往返保持记录一致性（含各 kind 的 FileChange 字段）', () => {
		const records: UndoRecord[] = [
			makeRecord({
				id: 'rec-content',
				opType: 'properties',
				files: [{ kind: 'content', path: 'a.md', beforeBlob: 'f-0.before.md', afterBlob: 'f-0.after.md' }],
			}),
			makeRecord({
				id: 'rec-path',
				opType: 'move',
				files: [{ kind: 'path', path: 'old.md', newPath: 'new.md' }],
			}),
			makeRecord({
				id: 'rec-create',
				opType: 'create',
				files: [{ kind: 'create', path: 'created.md', afterBlob: 'f-1.after.md' }],
			}),
			makeRecord({
				id: 'rec-delete',
				opType: 'delete',
				files: [{ kind: 'delete', path: 'gone.md', beforeBlob: 'f-2.before.md' }],
			}),
		];

		const parsed = parseRecords(serializeRecords(records));

		expect(parsed).toHaveLength(4);
		expect(parsed[0].id).toBe('rec-content');
		expect(parsed[0].files[0]).toEqual(records[0].files[0]);
		expect(parsed[1].files[0]).toEqual({ kind: 'path', path: 'old.md', newPath: 'new.md' });
		expect(parsed[2].files[0]).toEqual({ kind: 'create', path: 'created.md', afterBlob: 'f-1.after.md' });
		expect(parsed[3].files[0]).toEqual({ kind: 'delete', path: 'gone.md', beforeBlob: 'f-2.before.md' });
	});

	it('记录状态流转（active→partial→reverted）序列化后可保留', () => {
		const statuses = ['active', 'partial', 'reverted'] as const;
		const records = statuses.map((status, idx) => makeRecord({ id: `rec-${idx}`, status }));

		const parsed = parseRecords(serializeRecords(records));

		expect(parsed.map((r) => r.status)).toEqual(['active', 'partial', 'reverted']);
	});

	it('非法/损坏 JSON 降级解析为空列表', () => {
		expect(parseRecords('')).toEqual([]);
		expect(parseRecords('not-json{{{')).toEqual([]);
		expect(parseRecords('null')).toEqual([]);
		expect(parseRecords('{"not":"an array"}')).toEqual([]);
	});

	it('非数组或含非法记录的 manifest 只保留合法记录', () => {
		const raw = JSON.stringify([
			makeRecord({ id: 'valid' }),
			{ id: 123, time: 'oops', opType: 'properties', opLabel: '', status: 'active', files: [] },
			{ id: 'bad-kind', time: 1, opType: 'properties', opLabel: '', status: 'active', files: [{ kind: 'mystery', path: 'x.md' }] },
		]);

		const parsed = parseRecords(raw);

		expect(parsed).toHaveLength(1);
		expect(parsed[0].id).toBe('valid');
	});

	it('FileChange 各 kind 的必需字段校验：缺失关键字段的记录被过滤', () => {
		const raw = JSON.stringify([
			makeRecord({ id: 'ok' }),
			makeRecord({ id: 'no-blob', files: [{ kind: 'content', path: 'a.md' }] }),
			makeRecord({ id: 'no-newpath', files: [{ kind: 'path', path: 'a.md' }] }),
		]);

		const parsed = parseRecords(raw);

		expect(parsed.map((r) => r.id)).toEqual(['ok']);
	});

	it('空文件列表的记录合法（序列化往返一致）', () => {
		const record = makeRecord({ files: [] });
		expect(parseRecords(serializeRecords([record]))).toEqual([record]);
	});
});
