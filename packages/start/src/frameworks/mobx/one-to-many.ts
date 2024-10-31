import type { OneToManyComponent } from "@reactive-bench/core/benchmarks/one-to-many.ts";
import {
  autorun,
  computed,
  observable,
  runInAction,
  type IObservableValue,
  type IReactionDisposer,
} from "mobx";

export const component: OneToManyComponent = ({
  recordResult,
  xSize,
  ySize,
  noEffects,
}) => {
  const disposers: IReactionDisposer[] = [];
  const head = observable.box(-1);
  const body: IObservableValue<number>[][] = [];
  for (let y = 0; y < ySize; y++) {
    let lastRead = computed(() => head.get() + y);
    const row: IObservableValue<number>[] = [lastRead];
    body.push(row);
    for (let x = 1; x < xSize; x++) {
      const prevRead = lastRead;
      lastRead = computed(() => prevRead.get() + x);
      row.push(lastRead);
    }
    if (!noEffects) {
      disposers.push(
        autorun(() => {
          recordResult(y, lastRead.get());
        })
      );
    }
  }

  return {
    cleanup() {
      while (disposers.length) {
        disposers.pop()!();
      }
    },
    writeInput(v) {
      runInAction(() => {
        head.set(v);
      });
    },
    getBody() {
      return body.map((row) => row.map((s) => s.get()));
    },
  };
};
