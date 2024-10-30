import { stateArray } from "#lib/frameworks/metron/lib/collections/array";
import { deriveArray } from "#lib/frameworks/metron/lib/collections/array/derived";
import { state, type StateAtom } from "#lib/frameworks/metron/lib/state";
import { channel } from "#lib/frameworks/metron/runtime";
import type {
  TableComponent,
  TableItem,
} from "@reactive-bench/core/benchmarks/table.ts";

interface Item {
  id: number;
  value: StateAtom<number>;
}

export const component: TableComponent = ({ table }) => {
  let nextId = 0;
  const data = stateArray<Item>([]);
  table.onClear(() => {
    if (data.unwrap().length !== 0) {
      data.clear();
    }
  });
  table.onAppend((n) => {
    if (n === 0) {
      return;
    }
    const freshData = [];
    for (let i = 0; i < n; i++) {
      freshData.push({ id: nextId++, value: state(i) });
    }
    data.append(freshData);
  });
  table.onRemove((i) => {
    data.delete(i);
  });
  table.onSwap((a, b) => {
    data.swap(a, b);
  });
  const displayedItems = deriveArray(data, (row, read) => ({
    id: row.id.toString(),
    value: read(row.value).toString(),
  }));
  const disposer = channel.subscribe(data, () => {
    table.items = displayedItems.unwrap() as TableItem[];
  });
  return {
    cleanup: () => {
      disposer();
    },
    runDeferred() {
      channel.run();
    },
    getData: () =>
      data.unwrap().map((row) => ({ id: row.id, value: row.value.unwrap() })),
  };
};
