import { wrap, wrapDefer } from "#lib/frameworks/alien-signals/utils";
import type { TableComponent } from "@reactive-bench/core/benchmarks/table.ts";
import { effect, type ISignal, signal } from "alien-signals";

interface Item {
  id: number;
  value: ISignal<number>;
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
      nextData.push({ id: nextId++, value: signal(i) });
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
    table.items = data.get().map((row) => ({
      id: row.id.toString(),
      value: row.value.get().toString(),
    }));
  });
  return {
    getData: () =>
      data.get().map((row) => ({ id: row.id, value: row.value.get() })),
  };
};

export const eager = wrap(unwrapped);
export const component = wrapDefer(unwrapped);
