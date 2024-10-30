import { wrap, wrapDefer } from "#lib/frameworks/alien-signals/utils";
import type { CellXComponent } from "@reactive-bench/core/benchmarks/cellx.ts";
import {
  Signal,
  computed,
  effect,
  endBatch,
  signal,
  startBatch,
  type ISignal,
} from "alien-signals";

const unwrapped: CellXComponent = ({ recordResult, xSize, ySize }) => {
  const body: ISignal<number>[][] = [];
  const sources: Signal<number>[] = [];
  for (let y = 0; y < ySize; y++) {
    const source = signal(-1);
    effect(() => {
      recordResult(0, y, source.get());
    });
    const yRow: ISignal<number>[] = [source];
    sources.push(source);
    body.push(yRow);
  }

  const bottomY = ySize - 1;
  let layer: ISignal<number>[] = sources;
  for (let x = 1; x < xSize; x++) {
    const prevLayer = layer;
    const top = computed(() => prevLayer[1]!.get());
    effect(() => {
      recordResult(x, 0, top.get());
    });
    body[0]!.push(top);
    layer = [top];
    for (let y = 1; y < bottomY; y++) {
      const a = prevLayer[y - 1]!;
      const b = prevLayer[y + 1]!;
      const c = computed(
        y % 2 === 0 ? () => a.get() + b.get() : () => a.get() - b.get()
      );
      effect(() => {
        recordResult(x, y, c.get());
      });
      body[y]!.push(c);
      layer.push(c);
    }
    const bottom = computed(() => prevLayer[bottomY - 1]!.get());
    effect(() => {
      recordResult(x, bottomY, bottom.get());
    });
    body[bottomY]!.push(bottom);
    layer.push(bottom);
  }

  return {
    writeRow(y, value) {
      sources[y]!.set(value);
    },
    writeAll(value) {
      startBatch();
      for (const source of sources) {
        source.set(value);
      }
      endBatch();
    },
    getRow(y) {
      return body[y]!.map((s) => s.get());
    },
  };
};

export const eager = wrap(unwrapped);
export const component = wrapDefer(unwrapped);
