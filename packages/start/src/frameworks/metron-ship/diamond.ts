import type { DiamondComponent } from "@reactive-bench/core/benchmarks/diamond.ts";
import type { Disposer, Atom } from "./lib.js";
import { clean, channel, state, derive, stabilize } from "./lib.js";

export const component: DiamondComponent = ({ recordResult, size }) => {
  const head = state(-1);
  const disposers: Disposer[] = [];
  const body: Atom<number>[] = [];
  for (let n = 0; n < size; n++) {
    const d = derive((read) => read(head) * n);
    body.push(d);
  }
  const sum = derive((read) => body.reduce((acc, atom) => acc + read(atom), 0));

  disposers.push(
    channel.subscribe(sum, () => {
      recordResult(sum.unwrap());
    })
  );
  recordResult(sum.unwrap());

  return {
    cleanup: () => {
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
    getSum() {
      return sum.unwrap();
    },
    getBody() {
      return body.map((s) => s.unwrap());
    },
  };
};

export const managed: DiamondComponent = ({ recordResult, size }) => {
  const head = state(-1);
  const disposers: Disposer[] = [];
  const body: Atom<number>[] = [];
  for (let n = 0; n < size; n++) {
    const d = derive((read) => read(head) * n);
    disposers.push(d.manage());
    body.push(d);
  }
  const sum = derive((read) => body.reduce((acc, atom) => acc + read(atom), 0));

  disposers.push(
    sum.manage(),
    channel.subscribe(sum, () => {
      recordResult(sum.unwrap());
    })
  );
  recordResult(sum.unwrap());

  return {
    cleanup: () => {
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
    getSum() {
      return sum.unwrap();
    },
    getBody() {
      return body.map((s) => s.unwrap());
    },
  };
};