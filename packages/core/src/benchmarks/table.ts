import { createBenchmarkRunner } from "#lib/benchmark";
import type { Component, Controller } from "#lib/component";
import { fib } from "#lib/math";

export interface TableModel {
  items: TableItem[];
  readonly onAppend: (cb: (n: number) => undefined) => undefined;
  readonly onClear: (cb: () => undefined) => undefined;
  readonly onRemove: (cb: (i: number) => undefined) => undefined;
  readonly onSwap: (cb: (a: number, b: number) => undefined) => undefined;
}

export class TableItem {
  #brand = true;
  id: number;
  label: string;
  constructor(id: number, label: string) {
    this.id = id;
    this.label = label;
    fib(10);
  }
  static isTableItem(item: {}): item is TableItem {
    return #brand in item;
  }
}

export interface ExternalTableController {
  model: TableModel;
  append: (n: number) => undefined;
  clear: () => undefined;
  remove: (i: number) => undefined;
  swap: (a: number, b: number) => undefined;
}

function createEvent<TArgs extends unknown[]>() {
  let listener: (...args: TArgs) => undefined;
  const register = (cb: typeof listener): undefined => {
    if (listener !== undefined) {
      throw new Error("Cannot register multiple listeners");
    }
    listener = cb;
  };
  const emit: typeof listener = (...args) => listener?.(...args);
  return [register, emit] as const;
}

function createTable(): ExternalTableController {
  const items: TableItem[] = [];
  const [onAppend, append] = createEvent<[n: number]>();
  const [onClear, clear] = createEvent<[]>();
  const [onRemove, remove] = createEvent<[i: number]>();
  const [onSwap, swap] = createEvent<[a: number, b: number]>();

  const model: TableModel = {
    items,
    onAppend,
    onClear,
    onRemove,
    onSwap,
  };

  return {
    model,
    append,
    clear,
    remove,
    swap,
  };
}

export interface TableProps {
  table: TableModel;
}

export interface TableRowDatum {
  id: number;
  label: string;
}

export interface TableController extends Controller {
  getData: () => TableRowDatum[];
}

export type TableComponent = Component<TableProps, TableController>;

export interface TableParams {
  appendSize: number;
}

const setup = (component: TableComponent) => {
  const externalController = createTable();
  const componentController = component({ table: externalController.model });
  return {
    ...externalController,
    ...componentController,
  };
};

const clearTableInit = (controller: ExternalTableController): undefined => {
  controller.clear();
};

export const tableRun = createBenchmarkRunner({
  setup,
  preRun: clearTableInit,
  run: (controller, { appendSize }: TableParams) => {
    controller.append(appendSize);
  },
});

const existingTableInit = (
  controller: ExternalTableController,
  { appendSize }: TableParams
): undefined => {
  controller.clear();
  controller.append(appendSize);
};

const createExistingTableRunner = (
  run: (controller: ExternalTableController, params: TableParams) => undefined
) =>
  createBenchmarkRunner({
    setup,
    preRun: existingTableInit,
    run,
  });

export const tableAppend = createExistingTableRunner(
  (controller, { appendSize }) => {
    controller.append(appendSize);
  }
);

export const tableReplace = createExistingTableRunner(
  (controller, { appendSize }) => {
    controller.clear();
    controller.append(appendSize);
  }
);

export const tableRemove = createExistingTableRunner((controller) => {
  controller.remove(4);
});

export const tableSwap = createExistingTableRunner((controller) => {
  controller.swap(4, 15);
});
