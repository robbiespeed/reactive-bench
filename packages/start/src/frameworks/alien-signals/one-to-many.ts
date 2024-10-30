import { computed, effect, signal, type ISignal } from "alien-signals";
import type { OneToManyComponent } from "@reactive-bench/core/benchmarks/one-to-many.ts";
import { wrap, wrapDefer } from "#lib/frameworks/alien-signals/utils";

const unwrapped: OneToManyComponent = ({
  recordResult,
  xSize,
  ySize,
  noEffects,
}) => {
  const head = signal(-1);
  const body: ISignal[][] = [];
  for (let y = 0; y < ySize; y++) {
    let lastRead = computed(() => head.get() + y);
    const row: ISignal[] = [lastRead];
    body.push(row);
    for (let x = 1; x < xSize; x++) {
      const prevRead = lastRead;
      lastRead = computed(() => prevRead.get() + x);
      row.push(lastRead);
    }
    if (!noEffects) {
      effect(() => {
        recordResult(y, lastRead.get());
      });
    }
  }

  return {
    writeInput(v) {
      head.set(v);
    },
    getBody() {
      return body.map((row) => row.map((s) => s.get()));
    },
  };
};

export const eager = wrap(unwrapped);
export const component = wrapDefer(unwrapped);
