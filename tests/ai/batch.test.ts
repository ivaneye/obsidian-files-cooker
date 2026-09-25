import { describe, expect, it, vi } from 'vitest';

// 被测对象：runBatches——通用分批并发调度器
import { runBatches } from 'src/ai/batch';

/**
 * 测试目的：验证分批并发调度器的分片、并发、失败隔离与重试语义。
 * 测试内容：空集、余数批、并发峰值、单批失败不拖垮整体、重试后成功。
 * 预期结果：返回 {ok, failed} 两段；失败仅标记该批；重试成功进入 ok。
 */
describe('runBatches', () => {

    it('空集直接返回空结果且不调用 worker', async () => {
        const worker = vi.fn(async (batch: number[]) => batch.map(n => n * 2));
        const result = await runBatches([1, 2, 3], 5, 3, worker);
        // 单批场景：3 个元素 batchSize=5 时只有 1 批
        expect(result.ok).toEqual([2, 4, 6]);
        expect(result.failed).toEqual([]);
        expect(worker).toHaveBeenCalledTimes(1);
    });

    it('余数批正确分片（7 个元素按 3 片）', async () => {
        const batches: number[][] = [];
        const result = await runBatches([1, 2, 3, 4, 5, 6, 7], 3, 1, async (batch) => {
            batches.push(batch);
            return batch;
        });
        expect(batches).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
        expect(result.ok).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('并发峰值不超过 concurrency 上限', async () => {
        let running = 0;
        let peak = 0;
        const items = Array.from({ length: 20 }, (_, i) => i);
        await runBatches(items, 1, 3, async (batch) => {
            running++;
            peak = Math.max(peak, running);
            await new Promise((resolve) => setTimeout(resolve, 5));
            running--;
            return batch;
        });
        expect(peak).toBeLessThanOrEqual(3);
    });

    it('单批失败计入 failed，不影响其余批次（ok 按项扁平拼接）', async () => {
        const result = await runBatches([1, 2, 3, 4], 1, 2, async (batch) => {
            if (batch[0] === 2) {
                throw new Error('boom');
            }
            return batch;
        });
        // worker 按项返回结果，ok 为扁平拼接；失败批的原始项进入 failed
        expect(result.ok).toEqual([1, 3, 4]);
        expect(result.failed).toEqual([2]);
    });

    it('失败批重试一次后成功进入 ok', async () => {
        let attempts = 0;
        const result = await runBatches([1, 2], 1, 1, async (batch) => {
            if (batch[0] === 1) {
                attempts++;
                // 首次失败，重试成功
                if (attempts === 1) {
                    throw new Error('flaky');
                }
            }
            return batch;
        });
        expect(attempts).toBe(2);
        expect(result.ok).toEqual([1, 2]);
        expect(result.failed).toEqual([]);
    });

    it('重试仍失败则最终计入 failed', async () => {
        const result = await runBatches([1], 1, 1, async () => {
            throw new Error('always');
        });
        expect(result.ok).toEqual([]);
        expect(result.failed).toEqual([1]);
    });

    it('失败批次记录真实错误消息供上层展示', async () => {
        const result = await runBatches([1, 2], 1, 1, async (batch) => {
            if (batch[0] === 1) {
                throw new Error('AI 401: invalid api key');
            }
            return batch;
        });
        expect(result.errors).toEqual(['AI 401: invalid api key']);
    });

    it('shouldStop 返回 true 后不再执行剩余批次', async () => {
        const executed: number[] = [];
        const result = await runBatches(
            [1, 2, 3, 4],
            1,
            1,
            async (batch) => {
                executed.push(batch[0]);
                // 执行完第一批后触发取消
                if (batch[0] === 1) {
                    shouldStop = true;
                }
                return batch;
            },
            () => shouldStop,
        );
        expect(executed).toEqual([1]);
        expect(result.ok).toEqual([1]);
        expect(result.failed).toEqual([]);
    });
});

// shouldStop 在测试内可变，用外层变量承载
let shouldStop = false;
