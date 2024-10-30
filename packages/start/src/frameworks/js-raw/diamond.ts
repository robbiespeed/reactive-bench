import type { DiamondComponent } from "@reactive-bench/core/benchmarks/diamond.ts";

export const component: DiamondComponent = ({ recordResult, size }) => {
  let head = -1;

  let bodyCache: number[] | undefined;
  const getBody = (): number[] => {
    if (bodyCache === undefined) {
      bodyCache = [];
      for (let n = 0; n < size; n++) {
        let lastValue = head * n;
        bodyCache.push(lastValue);
      }
    }
    return bodyCache;
  };

  let sumCache: number | undefined;
  const getSum = () => {
    if (sumCache === undefined) {
      sumCache = getBody().reduce((sum, v) => sum + v);
    }
    return sumCache;
  };

  let isRecordDeferred = false;
  const runDeferred = (): undefined => {
    if (isRecordDeferred) {
      recordResult(getSum());
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
      sumCache = undefined;
      isRecordDeferred = true;
    },
    getBody,
    getSum,
    runDeferred,
  };
};
