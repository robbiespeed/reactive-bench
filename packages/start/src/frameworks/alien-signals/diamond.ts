import { computed, effect, signal, type ISignal } from "alien-signals";
import type { DiamondComponent } from "@reactive-bench/core/benchmarks/diamond.ts";
import { wrap, wrapDefer } from "#lib/frameworks/alien-signals/utils";

const unwrapped: DiamondComponent = ({ recordResult, size }) => {
  const head = signal(-1);
  const body: ISignal<number>[] = [];
  for (let n = 0; n < size; n++) {
    body.push(computed(() => head.get() * n));
  }
  const sum = computed(() => body.reduce((a, s) => a + s.get(), 0));
  effect(() => {
    recordResult(sum.get());
  });

  return {
    writeInput(v) {
      head.set(v);
    },
    getSum() {
      return sum.get();
    },
    getBody() {
      return body.map((s) => s.get());
    },
  };
};

export const eager = wrap(unwrapped);
export const component = wrapDefer(unwrapped);
