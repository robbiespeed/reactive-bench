import type { DiamondComponent } from "@reactive-bench/core/benchmarks/diamond.ts";
import { state, derive, deriveStatic } from "./lib/atom.js";
import { channel } from "./lib/runtime.js";
import type { Atom } from "./lib/shared.js";
import { clean, ORB, Orb, orbLinkStatic } from "./lib/orb.js";
import type { Disposer } from "./lib/shared.js";

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

function midRun(this: { n: number; head: Atom<number> }) {
  return this.head.unwrap() * this.n;
}
function midReg(this: { n: number; head: Atom<number> }, orb: Orb): undefined {
  orbLinkStatic(orb, this.head[ORB]);
}
function sumRun(this: { body: Atom<number>[] }) {
  return this.body.reduce((acc, v) => acc + v.unwrap(), 0);
}
function sumReg(this: { body: Atom<number>[] }, orb: Orb): undefined {
  for (const element of this.body) {
    orbLinkStatic(orb, element[ORB]);
  }
}

export const staticDerive: DiamondComponent = ({ recordResult, size }) => {
  const head = state(-1);
  const disposers: Disposer[] = [];
  const body: Atom<number>[] = [];

  for (let n = 0; n < size; n++) {
    const d = deriveStatic({
      run: midRun,
      registerSources: midReg,
      n,
      head,
    });
    disposers.push(d.manage());
    body.push(d);
  }
  const sum = deriveStatic({
    run: sumRun,
    registerSources: sumReg,
    body,
  });

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
