import { strictEqual } from "node:assert";
import { computed, signal, read, type Signal, type Computed, setSignal, stabilize } from "./lib.js";

const a = signal(0);

const c1 = computed(() => read(a));
const c2 = computed(() => read(c1));
const c3 = computed(() => read(c2));

const x1 = computed(() => {
  const aVal = read(a)
  if (aVal > 0) {
    read(c3);
  }
  return +(aVal == 2);
});

const x2 = computed(() => read(x1));

const y = computed(() => {
  const aVal = read(c2);
  if (aVal == 2) {
    return aVal + read(x2);
  }
  return aVal;
});

strictEqual(y.value, 0);
setSignal(a, 1);
stabilize();
strictEqual(y.value, 1);
setSignal(a, 2);
stabilize();
strictEqual(y.value, 3);
