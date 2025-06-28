import { computed, read, setSignal, type Signal, signal, stabilize } from "./lib.js";
import type { CellXComponent } from "@reactive-bench/core/benchmarks/cellx.ts";

export const component: CellXComponent = ({ recordResult, xSize, ySize }) => {
  const disposers: Signal<unknown>[] = [];
  const body: Signal<number>[][] = [];
  const sources: Signal<number>[] = [];
  for (let y = 0; y < ySize; y++) {
    const source = signal(-1);

    disposers.push(computed(() => {
      recordResult(0, y, read(source));
    }, true));

    const yRow: Signal<number>[] = [source];
    sources.push(source);
    body.push(yRow);
  }

  const bottomY = ySize - 1;
  let layer: Signal<number>[] = sources;
  for (let x = 1; x < xSize; x++) {
    const prevLayer = layer;
    const top = computed(() => read(prevLayer[1]!));

    disposers.push(computed(() => {
      recordResult(x, 0, read(top));
    }, true));

    body[0]!.push(top);
    layer = [top];
    for (let y = 1; y < bottomY; y++) {
      const a = prevLayer[y - 1]!;
      const b = prevLayer[y + 1]!;
      const c = computed(
        y % 2 === 0 ? () => read(a) + read(b) : () => read(a) - read(b)
      );

      disposers.push(computed(() => {
        recordResult(x, y, read(c));
      }, true));

      body[y]!.push(c);
      layer.push(c);
    }
    const bottom = computed(() => read(prevLayer[bottomY - 1]!));

    disposers.push(computed(() => {
      recordResult(x, bottomY, read(bottom));
    }, true));

    body[bottomY]!.push(bottom);
    layer.push(bottom);
  }

  return {
    cleanup() {
      // while (disposers.length) {
      //   disposers.pop()!;
      // }
      // stabilize();
    },
    runDeferred() {
      stabilize();
    },
    writeRow(y, value) {
      setSignal(sources[y]!, value);
    },
    writeAll(value) {
      for (const source of sources) {
        setSignal(source, value);
      }
    },
    getRow(y) {
      return body[y]!.map((s) => read(s));
    },
  };
};