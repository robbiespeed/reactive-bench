import type { OneToManyComponent } from "@reactive-bench/core/benchmarks/one-to-many.ts";
import { type Computed, computed, read, setSignal, type Signal, signal, stabilize } from "./lib.js";

export const component: OneToManyComponent = ({
  recordResult,
  xSize,
  ySize,
  noEffects,
}) => {
  const effects: Computed<void>[] = [];
  const head = signal(-1);
  const body: Signal<number>[][] = [];
  for (let y = 0; y < ySize; y++) {
    let lastRead = computed(() => read(head) + y);
    const row: Signal<number>[] = [lastRead];
    body.push(row);
    for (let x = 1; x < xSize; x++) {
      const prevRead = lastRead;
      lastRead = computed(() => read(prevRead) + x);
      row.push(lastRead);
    }
    if (!noEffects) {
      effects.push(
        computed(() => {
          recordResult(y, read(lastRead));
        })
      );
    }
  }

  return {
    cleanup() {
      // while (disposers.length) {
      //   disposers.pop()!();
      // }
    },
    runDeferred() {
      stabilize();
    },
    writeInput(v) {
      setSignal(head, v);
    },
    getBody() {
      return body.map((row) => row.map((s) => s.value));
    },
  };
};
