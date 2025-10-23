import type { ProjectionFanOutComponent } from "@reactive-bench/core/benchmarks/projection/fan-out.ts";
import { Atom, clean, state, compute, stabilize, AtomSubscriptionChannel, type AtomStateController, type AtomSubscription } from "../lib.js";

export const component: ProjectionFanOutComponent = ({
  recordResult,
  depthSize,
  fanSize,
}) => {
  const channel = new AtomSubscriptionChannel(() => { });
  const [head, setHead] = state(-1);
  const depthChainProjections: Atom[] = [];
  const depthChainOutputs: Atom<number>[] = [];

  for (let d = 0; d < depthSize; d++) {
    const source: Atom<number> = d > 0 ? depthChainOutputs[d - 1]! : head;
    let output!: AtomStateController<number>;
    const projection = compute(function chain(read) {
      const v = read(source);
      if (output === undefined) {
        output = Atom.createStateController(v + d);
        output.setOwner(this);
      } else {
        output.setState(v + d);
      }
    });
    projection.unwrap();
    depthChainProjections.push(projection);
    depthChainOutputs.push(output.atom);
  }

  const fanOutputs: AtomStateController<boolean>[] = [];
  let prevActiveOutput: AtomStateController<boolean> | undefined;
  const fanProjection = compute(function fan(read) {
    const h = read(head);

    let activeOutput: AtomStateController<boolean> | undefined;
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
      prevActiveOutput.setState(false);
    }
    if (activeOutput !== undefined) {
      activeOutput.setState(true);
    }

    prevActiveOutput = activeOutput;
  });
  fanProjection.unwrap();
  const disposers: AtomSubscription[] = [];
  for (let i = 0; i < fanSize; i++) {
    const output = Atom.createStateController(false);
    const outputAtom = output.atom;
    output.setOwner(fanProjection);
    fanOutputs.push(output);
    disposers.push(channel.subscribe(outputAtom, () => {
      recordResult(i, outputAtom.unwrap());
    }));
    recordResult(i, outputAtom.unwrap());
  }

  return {
    cleanup() {
      while (disposers.length) {
        disposers.pop()!.dispose();
      }
      clean();
      channel.clear();
    },
    runDeferred() {
      stabilize();
      channel.run();
    },
    writeInput(v) {
      setHead(v);
    },
    getTails() {
      return fanOutputs.map((f) => f.atom.unwrap());
    },
  };
};