import { clearNode, createNode, runNode, useEffect, useMemo, useState } from "./lib.js";
import type { CellXComponent, CellXProps } from "@reactive-bench/core/benchmarks/cellx.ts";

function CellXLayer ({ recordResult, xSize, ySize, x, sources }: CellXProps & { x: number; sources: number[]; }) {
  const layer = useMemo(() => {
    const top = sources[1]!;
    const l = [top];
    const bottomY = ySize - 1;
    for (let y = 1; y < bottomY; y++) {
      const a = sources[y - 1]!;
      const b = sources[y + 1]!;
      const c = y % 2 === 0 ? a + b : a - b;
      l.push(c);
    }
    const bottom = sources[bottomY - 1]!;
    l.push(bottom);
    return l;
  }, [sources]);

  useEffect(() => {
    layer.forEach((v, y) => recordResult(x, y, v));
  }, [layer]);

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
      s.push(-1);
    }
    return s;
  });

  useEffect(() => {
    sources.forEach((v, y) => recordResult(0, y, v));
  }, [sources]);
  
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