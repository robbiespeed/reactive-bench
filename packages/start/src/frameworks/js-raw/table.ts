import type {
  TableComponent,
  TableRowDatum,
} from "@reactive-bench/core/benchmarks/table.ts";

export const component: TableComponent = ({ table }) => {
  let nextId = 0;
  let data: TableRowDatum[] = [];
  table.onClear(() => {
    if (data.length) {
      data = [];
      table.items = [];
    }
  });
  table.onAppend((n) => {
    if (n === 0) {
      return;
    }
    const items = table.items;
    for (let i = 0; i < n; i++) {
      const datum: TableRowDatum = { id: nextId++, value: i };
      data.push(datum);
      items.push({ id: datum.id.toString(), value: datum.value.toString() });
    }
  });
  table.onRemove((i) => {
    table.items.splice(i, 1);
  });
  table.onSwap((a, b) => {
    const items = table.items;
    const tmp = items[a]!;
    items[a] = items[b]!;
    items[b] = tmp;
  });
  return {
    getData: () => data,
  };
};
