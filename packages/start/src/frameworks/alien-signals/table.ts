import { wrap, wrapDefer } from "#lib/frameworks/alien-signals/utils";
import {
  TableItem,
  type TableComponent,
} from "@reactive-bench/core/benchmarks/table.ts";
import { effect, endBatch, Signal, signal, startBatch } from "alien-signals";

interface Item {
  id: number;
  label: Signal<string>;
}

const unwrapped: TableComponent = ({ table }) => {
  let nextId = 0;
  const data = signal<Item[]>([]);
  table.onClear(() => {
    if (data.get().length !== 0) {
      data.set([]);
    }
  });
  table.onAppend((n) => {
    if (n === 0) {
      return;
    }
    const nextData = [...data.get()];
    for (let i = 0; i < n; i++) {
      nextData.push({ id: nextId++, label: signal(`${i}`) });
    }
    data.set(nextData);
  });
  table.onRemove((i) => {
    data.set([...data.get()].splice(i, 1));
  });
  table.onSwap((a, b) => {
    const nextData = data.get().slice();
    const tmp = nextData[a]!;
    nextData[a] = nextData[b]!;
    nextData[b] = tmp;
    data.set(nextData);
  });
  effect(() => {
    table.items = data
      .get()
      .map((row) => new TableItem(row.id, row.label.get()));
  });
  return {
    getData: () =>
      data.get().map((row) => ({ id: row.id, label: row.label.get() })),
  };
};

export const eager = wrap(unwrapped);
export const component = wrapDefer(unwrapped);
