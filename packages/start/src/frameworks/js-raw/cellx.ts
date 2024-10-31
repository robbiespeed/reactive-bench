import type { CellXComponent } from "@reactive-bench/core/benchmarks/cellx.ts";

export const component: CellXComponent = ({ recordResult, xSize, ySize }) => {
  const sources: number[] = [];
  for (let y = 0; y < ySize; y++) {
    sources.push(-1);
  }

  let bodyCache: number[][] | undefined;
  const getState = (): number[][] => {
    if (bodyCache === undefined) {
      const bottomY = ySize - 1;
      bodyCache = [];
      for (let y = 0; y < ySize; y++) {
        const yRow: number[] = [sources[y]!];
        bodyCache.push(yRow);
      }
      let layer = sources;
      for (let x = 1; x < xSize; x++) {
        const prevLayer = layer;
        const top = prevLayer[1]!;
        bodyCache[0]!.push(top);
        layer = [top];
        for (let y = 1; y < bottomY; y++) {
          const a = prevLayer[y - 1]!;
          const b = prevLayer[y + 1]!;
          const c = y % 2 === 0 ? a + b : a - b;
          bodyCache[y]!.push(c);
          layer.push(c);
        }
        const bottom = prevLayer[bottomY - 1]!;
        bodyCache[bottomY]!.push(bottom);
        layer.push(bottom);
      }
    }
    return bodyCache;
  };

  const recordResults = (): undefined => {
    const body = getState();
    for (let x = 0; x < xSize; x++) {
      for (let y = 0; y < ySize; y++) {
        recordResult(x, y, body[y]![x]!);
      }
    }
  };

  let isRecordDeferred = true;
  const runDeferred = (): undefined => {
    if (isRecordDeferred) {
      recordResults();
      isRecordDeferred = false;
    }
  };

  return {
    writeRow(y, value) {
      if (sources[y] === value) {
        return;
      }
      sources[y] = value;
      bodyCache = undefined;
      isRecordDeferred = true;
    },
    writeAll(value) {
      let isChanged = false;
      let y = 0;
      while (y < ySize) {
        if (sources[y] === value) {
          y++;
        }
        isChanged = true;
        break;
      }
      if (isChanged) {
        sources.fill(value);
        bodyCache = undefined;
        isRecordDeferred = true;
      }
    },
    getRow(y) {
      return getState()[y]!;
    },
    runDeferred,
  };
};
