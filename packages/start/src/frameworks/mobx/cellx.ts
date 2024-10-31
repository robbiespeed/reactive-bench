import type { CellXComponent } from "@reactive-bench/core/benchmarks/cellx.ts";
import {
  autorun,
  computed,
  observable,
  runInAction,
  type IObservableValue,
  type IReactionDisposer,
} from "mobx";

export const component: CellXComponent = ({ recordResult, xSize, ySize }) => {
  const disposers: IReactionDisposer[] = [];
  const body: IObservableValue<number>[][] = [];
  const sources: IObservableValue<number>[] = [];
  for (let y = 0; y < ySize; y++) {
    const source = observable.box(-1);
    disposers.push(
      autorun(() => {
        recordResult(0, y, source.get());
      })
    );
    const yRow: IObservableValue<number>[] = [source];
    sources.push(source);
    body.push(yRow);
  }

  const bottomY = ySize - 1;
  let layer: IObservableValue<number>[] = sources;
  for (let x = 1; x < xSize; x++) {
    const prevLayer = layer;
    const top = computed(() => prevLayer[1]!.get());
    disposers.push(
      autorun(() => {
        recordResult(x, 0, top.get());
      })
    );
    body[0]!.push(top);
    layer = [top];
    for (let y = 1; y < bottomY; y++) {
      const a = prevLayer[y - 1]!;
      const b = prevLayer[y + 1]!;
      const c = computed(
        y % 2 === 0 ? () => a.get() + b.get() : () => a.get() - b.get()
      );
      disposers.push(
        autorun(() => {
          recordResult(x, y, c.get());
        })
      );
      body[y]!.push(c);
      layer.push(c);
    }
    const bottom = computed(() => prevLayer[bottomY - 1]!.get());
    disposers.push(
      autorun(() => {
        recordResult(x, bottomY, bottom.get());
      })
    );
    body[bottomY]!.push(bottom);
    layer.push(bottom);
  }

  return {
    cleanup() {
      while (disposers.length) {
        disposers.pop()!();
      }
    },
    writeRow(y, value) {
      runInAction(() => {
        sources[y]!.set(value);
      });
    },
    writeAll(value) {
      runInAction(() => {
        for (const source of sources) {
          source.set(value);
        }
      });
    },
    getRow(y) {
      return body[y]!.map((s) => s.get());
    },
  };
};
