import {
  signal,
  computed,
  read,
  // insertIntoHeap,
  setSignal,
  stabilize,
} from "./lib.js";

const count = signal(0);

const doubleCount = computed(
  () => (console.log("double", read(count)), read(count) * 2),
);
const tripleCount = computed(
  () => (console.log("triple", read(count)), read(count) * 3),
);
let e = 0;
computed(() => {
  const _e = e++;
  console.log("EFFECT (Start)", _e);
  console.log("EFFECT", read(doubleCount), read(tripleCount));
  console.log("EFFECT (End)", _e);
}, true);
// insertIntoHeap(effect);

setSignal(count, 1);
console.log("DD", read(doubleCount));
setSignal(count, 2);
console.log("DD2", read(doubleCount));
setSignal(count, 3);
console.log("Stabilize Start");
stabilize();
console.log("Stabilize End");