import {
  observable,
  computed,
  autorun,
  type IObservableValue,
  runInAction,
} from "mobx";
import type { DiamondComponent } from "@reactive-bench/core/benchmarks/diamond.ts";
import { scheduler, wrapDefer } from "#lib/frameworks/mobx/utils";

export const eager: DiamondComponent = ({ recordResult, size }) => {
  const head = observable.box(-1);
  const body: IObservableValue<number>[] = [];
  for (let n = 0; n < size; n++) {
    body.push(computed(() => head.get() * n));
  }
  const sum = computed(() => body.reduce((a, s) => a + s.get(), 0));
  const disposer = autorun(
    () => {
      recordResult(sum.get());
    },
    { scheduler }
  );

  return {
    cleanup: () => {
      disposer();
    },
    writeInput(v) {
      runInAction(() => {
        head.set(v);
      });
    },
    getSum() {
      return sum.get();
    },
    getBody() {
      return body.map((s) => s.get());
    },
  };
};

export const component = wrapDefer(eager);
