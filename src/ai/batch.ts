/**
 * 分批并发调度器。
 *
 * 职责说明：
 * - 将输入项按 batchSize 分片，以 concurrency 上限并发执行 worker；
 * - 单批失败指数退避重试一次，仍失败计入 failed，不中断整体（网络抖动 / 429 / 5xx 场景）；
 * - 纯工具函数，无 Obsidian 依赖，P2/P3 的批量 AI 调用直接复用。
 */

/** 单批 worker：输入一批原始项，返回该批的处理结果数组（与批次一一对应）。 */
export type BatchWorker<T, R> = (batch: T[]) => Promise<R[]>;

/** 调度结果：成功项集合（保持顺序）、失败项集合与对应错误消息。 */
export interface BatchResult<T, R> {
	ok: R[];
	failed: T[];
	/** 每个失败批次的错误消息（按失败批次顺序，可重复）。 */
	errors: string[];
}

/** 重试前的退避等待（毫秒）。 */
const RETRY_DELAY_MS = 800;

/**
 * 按批次并发执行：每批独立重试一次，失败隔离。
 * ok 中的结果按原始批次顺序拼接；failed 收集失败批次的原始项。
 * shouldStop 在每批开始前轮询，返回 true 时不再领取剩余批次（取消场景）。
 */
export async function runBatches<T, R>(
	items: T[],
	batchSize: number,
	concurrency: number,
	worker: BatchWorker<T, R>,
	shouldStop?: () => boolean,
): Promise<BatchResult<T, R>> {
	const size = Math.max(1, batchSize);
	const limit = Math.max(1, concurrency);

	// 分片
	const batches: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		batches.push(items.slice(i, i + size));
	}

	const ok: R[] = [];
	const failed: T[] = [];
	const errors: string[] = [];
	let nextIndex = 0;

	// 简单工作池：每个并发槽从待处理队列取批执行，直到取空或被取消
	const runSlot = async (): Promise<void> => {
		while (nextIndex < batches.length && !(shouldStop?.() ?? false)) {
			const index = nextIndex++;
			const batch = batches[index];
			try {
				const results = await runWithRetry(batch, worker);
				ok.push(...results);
			} catch (e) {
				// 失败隔离：记录原始项与真实错误消息，供上层展示原因
				failed.push(...batch);
				errors.push(e instanceof Error ? e.message : String(e));
			}
		}
	};

	await Promise.all(Array.from({ length: Math.min(limit, batches.length) }, () => runSlot()));

	return { ok, failed, errors };
}

/** 执行单批，失败时退避后重试一次，再失败则抛出。 */
async function runWithRetry<T, R>(batch: T[], worker: BatchWorker<T, R>): Promise<R[]> {
	try {
		return await worker(batch);
	} catch (firstError) {
		await delay(RETRY_DELAY_MS);
		try {
			return await worker(batch);
		} catch (secondError) {
			throw secondError;
		}
	}
}

/** 等待指定毫秒。 */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
