import { EmitController, EMITTER } from "#lib/frameworks/metron-o/lib/emitter";
import {
  createManagedReceiverOrb,
  createReceiverOrb,
  createTransmitterOrb,
  ORB,
} from "./orb.js";
import { EMPTY_CACHE, type Atom, type Reader } from "./shared.js";

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

export class AutoDeriveAtom<T> implements Atom<T> {
  #emitController: EmitController | undefined;
  #receiver = createReceiverOrb(() => {
    if (this.#store === EMPTY_CACHE) {
      return false;
    }
    this.#store = EMPTY_CACHE;
    this.#emitController?.emit();
    return true;
  });
  #orb = this.#receiver.tryDeref();
  #store: T | typeof EMPTY_CACHE = EMPTY_CACHE;
  #deriveFn: (read: Reader) => T;
  constructor(derivation: (read: Reader) => T) {
    this.#deriveFn = derivation;
  }
  unwrap(): T {
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    this.#store = this.#receiver.run(this.#deriveFn);
    return this.#store;
  }
  get [ORB]() {
    return this.#orb;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
}

export const derive = <T>(derivation: (read: Reader) => T) =>
  new AutoDeriveAtom(derivation);

export const deriveAuto = <T>(derivation: (read: Reader) => T) =>
  new AutoDeriveAtom(derivation);

export class ManagedDeriveAtom<T> implements Atom<T>, Disposable {
  #emitController: EmitController | undefined;
  #receiver = createManagedReceiverOrb(() => {
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
    this.#store = this.#receiver.run(this.#deriveFn);
    return this.#store;
  }
  get [ORB]() {
    return this.#receiver.tryDeref();
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
  own() {
    return () => this.#receiver.dispose();
  }
  [Symbol.dispose]() {
    this.#receiver.dispose();
  }
}

export const deriveManaged = <T>(derivation: (read: Reader) => T) =>
  new ManagedDeriveAtom(derivation);
