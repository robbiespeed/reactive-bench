/**
 * get memory usage in kb
 */
function getMemoryUsageFn(): () => number {
  return () => {
    const raw = process.memoryUsage();
    return (raw.arrayBuffers + raw.external + raw.heapUsed) / 1000;
  };
}

export const readMemoryUsage = getMemoryUsageFn();
