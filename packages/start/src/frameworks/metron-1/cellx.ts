import type { CellXComponent } from "@reactive-bench/core/benchmarks/cellx.ts";
import { Atom, clean, state, stabilize, AtomSubscriptionChannel, derive, type AtomSubscription, type Setter } from "./lib.js";


export const component: CellXComponent = ({ recordResult, xSize, ySize }) => {
  const channel = new AtomSubscriptionChannel(() => { });
  const disposers: AtomSubscription[] = [];
  const body: Atom<number>[][] = [];
  const sources: Atom<number>[] = [];
  const sourceSetters: Setter<number>[] = [];
  for (let y = 0; y < ySize; y++) {
    const [source, setSource] = state(-1);

    disposers.push(
      channel.subscribe(source, () => {
        recordResult(0, y, source.unwrap());
      })
    );
    recordResult(0, y, source.unwrap());

    const yRow: Atom<number>[] = [source];
    sourceSetters.push(setSource)
    sources.push(source);
    body.push(yRow);
  }

  const bottomY = ySize - 1;
  let layer: Atom<number>[] = sources;
  for (let x = 1; x < xSize; x++) {
    const prevLayer = layer;
    const top = derive((read) => read(prevLayer[1]!));

    disposers.push(
      channel.subscribe(top, () => {
        recordResult(x, 0, top.unwrap());
      })
    );
    recordResult(x, 0, top.unwrap());

    body[0]!.push(top);
    layer = [top];
    for (let y = 1; y < bottomY; y++) {
      const a = prevLayer[y - 1]!;
      const b = prevLayer[y + 1]!;
      const c = derive(
        y % 2 === 0 ? (read) => read(a) + read(b) : (read) => read(a) - read(b)
      );

      disposers.push(
        channel.subscribe(c, () => {
          recordResult(x, y, c.unwrap());
        })
      );
      recordResult(x, y, c.unwrap());

      body[y]!.push(c);
      layer.push(c);
    }
    const bottom = derive((read) => read(prevLayer[bottomY - 1]!));

    disposers.push(
      channel.subscribe(bottom, () => {
        recordResult(x, bottomY, bottom.unwrap());
      })
    );
    recordResult(x, bottomY, bottom.unwrap());

    body[bottomY]!.push(bottom);
    layer.push(bottom);
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
    writeRow(y, value) {
      sourceSetters[y]!(value);
    },
    writeAll(value) {
      for (const set of sourceSetters) {
        set(value);
      }
    },
    getRow(y) {
      return body[y]!.map((s) => s.unwrap());
    },
  };
};