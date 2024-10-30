declare const Bun: any;

function getGC(): () => Promise<undefined> {
  if (globalThis.gc) {
    const gc = globalThis.gc;
    return async () => {
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
      gc();
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
    };
  } else if ((globalThis as any).Bun) {
    return async () => {
      await Bun.gc(false);
      return;
    };
  }
  return async () => {};
}

export const garbageCollect = getGC();
