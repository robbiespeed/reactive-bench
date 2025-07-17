import type { DiamondComponent } from "@reactive-bench/core/benchmarks/diamond.ts";
import { computed, read, setSignal, type Signal, signal, stabilize } from "./lib.js";

export const component: DiamondComponent = ({ recordResult, size }) => {
  const head = signal(-1);
  const body: Signal<number>[] = [];
  for (let n = 0; n < size; n++) {
    body.push(computed(() => read(head) * n));
  }
  const sum = computed(() => body.reduce((acc, atom) => acc + read(atom), 0));

  computed(() => {
    recordResult(read(sum));
  }, true);

  return {
    // cleanup: () => {
    //   disposer();
    // },
    runDeferred() {
      stabilize();
    },
    writeInput(v) {
      setSignal(head, v);
    },
    getSum() {
      return read(sum);
    },
    getBody() {
      return body.map((s) => read(s));
    },
  };
};
