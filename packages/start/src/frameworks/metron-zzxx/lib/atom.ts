import { EmitController, EMITTER } from "#lib/frameworks/metron-o/lib/emitter";
import { ORB, OrbController } from "./orb.js";
import { EMPTY_CACHE, type Atom, type Reader } from "./shared.js";

export class StateAtom<T> implements Atom<T> {
  #emitController: EmitController | undefined;
  #orbController: OrbController | undefined;
  #store: T;
  constructor(initialValue: T) {
    this.#store = initialValue;
  }
  set(value: T): undefined {
    if (value === this.#store) {
      return;
    }
    this.#store = value;
    this.#orbController?.transmit();
    this.#emitController?.emit();
  }
  unwrap(): T {
    return this.#store;
  }
  get [ORB]() {
    return (this.#orbController ??= new OrbController()).orb;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
}

export const state = <T>(initialValue: T) => new StateAtom(initialValue);

export class AutoDeriveAtom<T> implements Atom<T> {
  #emitController: EmitController | undefined;
  #orbController!: OrbController;
  #store: T | typeof EMPTY_CACHE = EMPTY_CACHE;
  #deriveFn: (read: Reader) => T;
  constructor(derivation: (read: Reader) => T) {
    this.#orbController = new OrbController();
    this.#orbController.setIntercept(() => {
      if (this.#store === EMPTY_CACHE) {
        return false;
      }
      this.#store = EMPTY_CACHE;
      this.#emitController?.emit();
      return true;
    });
    this.#deriveFn = derivation;
  }
  unwrap(): T {
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    // this.#store = this.#orbController.receiveRaw((link) =>
    //   this.#deriveFn(<U>(a: Atom<U>): U => {
    //     link(a[ORB]);
    //     return a.unwrap();
    //   })
    // );
    this.#store = this.#orbController.receive(this.#deriveFn);
    return this.#store;
  }
  get [ORB]() {
    return (this.#orbController ??= new OrbController()).orb;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
}

export const derive = <T>(derivation: (read: Reader) => T) =>
  new AutoDeriveAtom(derivation);

export class ManagedDeriveAtom<T> implements Atom<T>, Disposable {
  #emitController: EmitController | undefined;
  #orbController!: OrbController;
  #store: T | typeof EMPTY_CACHE = EMPTY_CACHE;
  #deriveFn: (read: Reader) => T;
  constructor(derivation: (read: Reader) => T) {
    this.#orbController = new OrbController();
    this.#orbController.manage();
    this.#orbController.setIntercept(() => {
      if (this.#store === EMPTY_CACHE) {
        return false;
      }
      this.#store = EMPTY_CACHE;
      this.#emitController?.emit();
      return true;
    });
    this.#deriveFn = derivation;
  }
  unwrap(): T {
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    this.#store = this.#orbController.receive(this.#deriveFn);
    return this.#store;
  }
  get [ORB]() {
    return (this.#orbController ??= new OrbController()).orb;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
  own() {
    return () => this.#orbController.dispose();
  }
  [Symbol.dispose]() {
    this.#orbController.dispose();
  }
}

export const deriveManaged = <T>(derivation: (read: Reader) => T) =>
  new ManagedDeriveAtom(derivation);
