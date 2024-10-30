import type { OneToManyComponent } from "@reactive-bench/core/benchmarks/one-to-many.ts";

export const component: OneToManyComponent = ({
  recordResult,
  xSize,
  ySize,
  noEffects,
}) => {
  let head = -1;

  let bodyCache: number[][] | undefined;
  const getBody = (): number[][] => {
    if (bodyCache === undefined) {
      bodyCache = [];
      for (let y = 0; y < ySize; y++) {
        let lastValue = head + y;
        const yRow: number[] = [lastValue];
        bodyCache.push(yRow);
        for (let x = 1; x < xSize; x++) {
          yRow.push(lastValue + x);
        }
      }
    }
    return bodyCache;
  };

  const recordResults = (): undefined => {
    const body = getBody();
    const lastY = xSize - 1;
    for (let y = 0; y < ySize; y++) {
      const yRow = body[y]!;
      recordResult(y, yRow[lastY]!);
    }
  };

  let isRecordDeferred = false;
  const runDeferred = noEffects
    ? undefined
    : (): undefined => {
        if (isRecordDeferred) {
          recordResults();
          isRecordDeferred = false;
        }
      };

  return {
    writeInput(v) {
      if (v === head) {
        return;
      }
      head = v;
      bodyCache = undefined;
      isRecordDeferred = true;
    },
    getBody,
    runDeferred,
  };
};
