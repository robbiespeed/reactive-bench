import type { ProjectionFanInComponent } from "@reactive-bench/core/benchmarks/projection/fan-in.ts";
import { type Computed, computed, read, setSignal, type Signal, signal, stabilize } from "../lib.js";

export const component: ProjectionFanInComponent = ({
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
    const projection = computed(function chain (this: Computed<void>) {
      const v = read(source);
      if (output === undefined) {
        output = signal(v + d, this);
      } else {
        setSignal(output, v + d);
      }
    });
    depthChainProjections.push(projection);
    depthChainOutputs.push(output);
  }

  const fanInputs: Signal<number>[] = [];
  for (let i = 0; i < fanSize; i++) {
    const input = signal(i);
    fanInputs.push(input);
  }

  let fanOutput!: Signal<number>;
  computed(function fan (this: Computed<void>) {
    const h = read(head);
    
    let v: number = h;
    if (h >= 0) {
      const chainSource = depthChainOutputs[h % depthSize];
      if (chainSource) {
        // console.log(this.height);
        v = read(chainSource);
        // console.log(this.height);
      }
    }

    for (let i = 0; i < fanSize; i++) {
      v += read(fanInputs[i]!);
    }

    v = Math.floor(v / fanSize);

    if (fanOutput === undefined) {
      fanOutput = signal(v, this);
    } else {
      setSignal(fanOutput, v);
    }
  });

  computed(() => {
    recordResult(read(fanOutput));
  });

  return {
    // cleanup() {
    // },
    runDeferred() {
      stabilize();
    },
    writeInput(v) {
      setSignal(head, v);
    },
    getTail() {
      return fanOutput.value;
    },
  };
};