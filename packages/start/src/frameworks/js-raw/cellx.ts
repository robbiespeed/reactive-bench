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
        recordResult(0, y, sources[y]!);
        bodyCache.push(yRow);
      }
      let layer = sources;
      for (let x = 1; x < xSize; x++) {
        const prevLayer = layer;
        const top = prevLayer[1]!;
        recordResult(x, 0, top);
        bodyCache[0]!.push(top);
        layer = [top];
        for (let y = 1; y < bottomY; y++) {
          const a = prevLayer[y - 1]!;
          const b = prevLayer[y + 1]!;
          const c = y % 2 === 0 ? a + b : a - b;
          recordResult(x, y, c);
          bodyCache[y]!.push(c);
          layer.push(c);
        }
        const bottom = prevLayer[bottomY - 1]!;
        recordResult(x, bottomY, bottom);
        bodyCache[bottomY]!.push(bottom);
        layer.push(bottom);
      }
    }
    return bodyCache;
  };

  getState();

  return {
    writeRow(y, value) {
      if (sources[y] === value) {
        return;
      }
      sources[y] = value;
      bodyCache = undefined;
    },
    writeAll(value) {
      sources.fill(value);
      bodyCache = undefined;
    },
    getRow(y) {
      return getState()[y]!;
    },
  };
};
