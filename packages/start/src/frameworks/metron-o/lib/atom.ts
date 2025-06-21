import { EmitController, EMITTER } from "#lib/frameworks/metron-o/lib/emitter";
import {
  createReceiverOrb,
  createTransmitterOrb,
  ORB,
} from "#lib/frameworks/metron-o/lib/orb";
import {
  EMPTY_CACHE,
  type Atom,
  type Reader,
} from "#lib/frameworks/metron-o/lib/shared";

export class StateAtom<T> implements Atom<T> {
  #emitController: EmitController | undefined;
  #orbPack = createTransmitterOrb(() => {
    this.#emitController?.emit();
    return true;
  });
  #store: T;
  constructor(initialValue: T) {
    this.#store = initialValue;
  }
  set(value: T): undefined {
    if (value === this.#store) {
      return;
    }
    this.#store = value;
    this.#orbPack.transmit();
  }
  unwrap(): T {
    return this.#store;
  }
  get [ORB]() {
    return this.#orbPack.orb;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
}

export const state = <T>(initialValue: T) => new StateAtom(initialValue);

export class DerivedAtom<T> implements Atom<T> {
  #emitController: EmitController | undefined;
  #orbPack = createReceiverOrb(() => {
    if (this.#store === EMPTY_CACHE) {
      return false;
    }
    this.#store = EMPTY_CACHE;
    this.#emitController?.emit();
    return true;
  });
  #store: T | typeof EMPTY_CACHE = EMPTY_CACHE;
  #deriveFn: (read: Reader) => T;
  constructor(derivation: (read: Reader) => T) {
    this.#deriveFn = derivation;
  }
  unwrap(): T {
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    this.#store = this.#orbPack.run(this.#deriveFn);
    return this.#store;
  }
  get [ORB]() {
    return this.#orbPack.orb;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
}

export const derive = <T>(derivation: (read: Reader) => T) =>
  new DerivedAtom(derivation);
