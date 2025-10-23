import type { ProjectionFanInComponent } from "@reactive-bench/core/benchmarks/projection/fan-in.ts";
import type { Atom, DeriveAtom } from "../lib.js";
import { clean, channel, attach, state, derive, stabilize } from "../lib.js";

export const component: ProjectionFanInComponent = ({
  recordResult,
  depthSize,
  fanSize,
}) => {
  const head = state(-1);
  const fanInputs: Atom<number>[] = [];
  for (let i = 0; i < fanSize; i++) {
    const input = state(i);
    fanInputs.push(input);
  }
  const chainStart = derive(function cs(read) {
    let v = read(head);
    for (let i = 0; i < fanSize; i++) {
      v += read(fanInputs[i]!);
    }
    return v;
  });
  const depthChainProjections: Atom[] = [];
  const depthChainOutputs: Atom<number>[] = [];

  for (let d = 0; d < depthSize; d++) {
    const source: Atom<number> = d > 0 ? depthChainOutputs[d - 1]! : chainStart;
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



  let fanOutput!: Atom<number>;
  const fanProjection = derive(function fan(this: DeriveAtom, read) {
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

    if (fanOutput === undefined) {
      fanOutput = state(v);
      attach(fanOutput, this);
    } else {
      fanOutput.set(v);
    }
  }, true);
  fanProjection.unwrap();

  const dispose = channel.subscribe(fanOutput, () => {
    recordResult(fanOutput.unwrap());
  });
  recordResult(fanOutput.unwrap());


  return {
    cleanup() {
      dispose();
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
    getTail() {
      return fanOutput.unwrap();
    },
  };
};