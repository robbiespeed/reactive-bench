import { clearNode, createNode, runNode, useMemo, useState } from "./lib.js";
import type { CellXComponent, CellXProps } from "@reactive-bench/core/benchmarks/cellx.ts";

function CellXLayer ({ recordResult, xSize, ySize, x, sources }: CellXProps & { x: number; sources: number[]; }) {
  const layer = useMemo(() => {
    const top = sources[1]!;
    recordResult(x, 0, top);
    const l = [top];
    const bottomY = ySize - 1;
    for (let y = 1; y < bottomY; y++) {
      const a = sources[y - 1]!;
      const b = sources[y + 1]!;
      const c = y % 2 === 0 ? a + b : a - b;
      recordResult(x, y, c);
      l.push(c);
    }
    const bottom = sources[bottomY - 1]!;
    recordResult(x, bottomY, bottom);
    l.push(bottom);
    return l;
  }, [sources]);
  const nextX = x + 1;
  return nextX < xSize ? [
    layer,
    createNode(CellXLayer, { recordResult, xSize, ySize, x: nextX, sources: layer }),
  ] : [
    layer
  ];
}

function CellXRoot ({ recordResult, xSize, ySize }: CellXProps) {
  const [sources, setSources] = useState<number[]>(() => {
    const s: number[] = [];
    for (let y = 0; y < ySize; y++) {
      recordResult(0, y, -1);
      s.push(-1);
    }
    return s;
  });
  
  return [
    {
      sources,
      setSources(v: number[]) {
        setSources(v);
        for (let y = 0; y < ySize; y++) {
          recordResult(0, y, v[y]!);
        }
      },
    },
    createNode(CellXLayer, { recordResult, xSize, ySize, x: 1, sources }),
  ];
}

export const component: CellXComponent = (props) => {
  const root = createNode(CellXRoot, props);
  function setSources (s: number[]) {
    root.output[0].setSources(s);
  }
  runNode(root);

  return {
    cleanup() {
      clearNode(root);
    },
    writeRow(y, value) {
      const n = [...root.output[0].sources];
      n[y] = value;
      setSources(n);
    },
    writeAll(value) {
      setSources(new Array(props.ySize).fill(value));
    },
    getRow(y) {
      const r = [root.output[0].sources[y]];
      let layer = root.output[1].output;
      while (layer) {
        r.push(layer[0][y]);
        layer = layer[1]?.output;
      }
      return r;
    },
  };
};