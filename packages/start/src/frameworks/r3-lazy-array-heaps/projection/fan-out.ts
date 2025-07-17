import type { ProjectionFanOutComponent } from "@reactive-bench/core/benchmarks/projection/fan-out.ts";
import { type Computed, computed, read, setSignal, type Signal, signal, stabilize } from "../lib.js";

export const component: ProjectionFanOutComponent = ({
  recordResult,
  depthSize,
  fanSize,
}) => {
  const head = signal(-1);
  const depthChainProjections: Computed<void>[] = [];
  const depthChainOutputs: Signal<number>[] = [];

  for (let d = 0; d < depthSize; d++) {
    const source: Signal<number> = d > 0 ? depthChainOutputs[d - 1]! : head;
    let output!: Signal<number>;
    const projection = computed(function chain(this: Computed<void>) {
      const v = read(source);
      if (output === undefined) {
        output = signal(v + d, this);
      } else {
        setSignal(output, v + d);
      }
    });
    read(projection);
    depthChainProjections.push(projection);
    depthChainOutputs.push(output);
  }

  const fanOutputs: Signal<boolean>[] = [];
  let prevActiveOutput: Signal<boolean> | undefined;
  const fanProjection = computed(function fan(this: Computed<void>) {
    const h = read(head);

    let activeOutput: Signal<boolean> | undefined;
    if (h >= 0) {
      const chainSource = depthChainOutputs[h % depthSize];
      if (chainSource) {
        // console.log(this.height);
        activeOutput = fanOutputs[read(chainSource) % fanSize];
        // console.log(this.height);
      } else {
        activeOutput = fanOutputs[h];
      }
    }

    if (prevActiveOutput === activeOutput) {
      return;
    }
    if (prevActiveOutput !== undefined) {
      setSignal(prevActiveOutput, false);
    }
    if (activeOutput !== undefined) {
      setSignal(activeOutput, true);
    }

    prevActiveOutput = activeOutput;
  });
  read(fanProjection);

  const effects: Computed<void>[] = [];
  for (let i = 0; i < fanSize; i++) {
    const output = signal(false, fanProjection);
    fanOutputs.push(output);
    effects.push(computed(() => {
      recordResult(i, read(output));
    }, true));
  }

  return {
    cleanup() {
      stabilize();
    },
    runDeferred() {
      stabilize();
    },
    writeInput(v) {
      setSignal(head, v);
    },
    getTails() {
      return fanOutputs.map((f) => read(f));
    },
  };
};