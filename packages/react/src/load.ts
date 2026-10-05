export function loadWithTimeout<Result>(
  load: (signal: AbortSignal) => Promise<Result>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const controller = new AbortController();
    const cleanup = () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => {
      const error = new Error('Remote loading was aborted.');
      error.name = 'AbortError';
      controller.abort(error);
      finish(() => reject(error));
    };
    const timer = setTimeout(() => {
      const error = new Error(`Remote import timed out after ${timeoutMs}ms.`);
      controller.abort(error);
      finish(() => reject(error));
    }, timeoutMs);

    if (externalSignal?.aborted) {
      abort();
      return;
    }
    externalSignal?.addEventListener('abort', abort, { once: true });

    Promise.resolve()
      .then(() => (settled ? undefined : load(controller.signal)))
      .then(
        (result) => {
          if (!settled) finish(() => resolve(result as Result));
        },
        (error: unknown) => {
          if (!settled) finish(() => reject(error));
        },
      );
  });
}
