import type { ProjectionFanOutComponent } from "@reactive-bench/core/benchmarks/projection/fan-out.ts";
import type { Disposer, Atom, DeriveAtom } from "../lib.js";
import { clean, channel, attach, state, derive, stabilize } from "../lib.js";

export const component: ProjectionFanOutComponent = ({
  recordResult,
  depthSize,
  fanSize,
}) => {
  const head = state(-1);
  const depthChainProjections: Atom[] = [];
  const depthChainOutputs: Atom<number>[] = [];

  for (let d = 0; d < depthSize; d++) {
    const source: Atom<number> = d > 0 ? depthChainOutputs[d - 1]! : head;
    let output!: Atom<number>;
    const projection = derive(function chain(this: DeriveAtom, read) {
      const v = read(source);
      if (output === undefined) {
        output = state(v + d);
        attach(output, this);
      } else {
        output.set(v + d);
      }
    }, true);
    projection.unwrap();
    depthChainProjections.push(projection);
    depthChainOutputs.push(output);
  }

  const fanOutputs: Atom<boolean>[] = [];
  let prevActiveOutput: Atom<boolean> | undefined;
  const fanProjection = derive(function fan(this: DeriveAtom, read) {
    const h = read(head);

    let activeOutput: Atom<boolean> | undefined;
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
      prevActiveOutput.set(false);
    }
    if (activeOutput !== undefined) {
      activeOutput.set(true);
    }

    prevActiveOutput = activeOutput;
  }, true);
  fanProjection.unwrap();
  const disposers: Disposer[] = [];
  for (let i = 0; i < fanSize; i++) {
    const output = state(false);
    attach(output, fanProjection);
    fanOutputs.push(output);
    disposers.push(channel.subscribe(output, () => {
      recordResult(i, output.unwrap());
    }));
    recordResult(i, output.unwrap());
  }

  return {
    cleanup() {
      while (disposers.length) {
        disposers.pop()!();
      }
      clean();
      channel.run();
    },
    runDeferred() {
      stabilize();
      channel.run();
    },
    writeInput(v) {
      head.set(v);
    },
    getTails() {
      return fanOutputs.map((f) => f.unwrap());
    },
  };
};