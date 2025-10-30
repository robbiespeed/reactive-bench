import type { ProjectionFanInComponent } from "@reactive-bench/core/benchmarks/projection/fan-in.ts";
import { Atom, clean, state, compute, stabilize, AtomSubscriptionChannel } from "../lib.js";

export const component: ProjectionFanInComponent = ({
  recordResult,
  depthSize,
  fanSize,
}) => {
  const channel = new AtomSubscriptionChannel(() => { });
  const [head, setHead] = state(-1);
  const fanInputs: Atom<number>[] = [];
  for (let i = 0; i < fanSize; i++) {
    const [input] = state(i);
    fanInputs.push(input);
  }
  const chainStart = compute(function cs(read) {
    let v = read(head);
    for (let i = 0; i < fanSize; i++) {
      v += read(fanInputs[i]!);
    }
    return v;
  });
  const depthChainOutputs: Atom<number>[] = [];

  for (let d = 0; d < depthSize; d++) {
    const source: Atom<number> = d > 0 ? depthChainOutputs[d - 1]! : chainStart;
    const outputController = Atom.createStateController(source.unwrap() + d);
    const projector = compute(function chain(read) {
      const v = read(source);
      outputController.setState(v + d);
    });
    outputController.setOwner(projector);
    depthChainOutputs.push(outputController.atom);
  }

  const fanOutputController = Atom.createStateController(head.unwrap());
  const outProjector = compute(function fan(read) {
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

    fanOutputController.setState(v);
  });
  fanOutputController.setOwner(outProjector);
  const fanOutput = fanOutputController.atom;

  const subscription = channel.subscribe(fanOutput, () => {
    recordResult(fanOutput.unwrap());
  });
  recordResult(fanOutput.unwrap());

  return {
    cleanup() {
      subscription.dispose();
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
    getTail() {
      return fanOutput.unwrap();
    },
  };
};