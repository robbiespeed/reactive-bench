import { EmitController, EMITTER } from "#lib/frameworks/metron-o/lib/emitter";
import { Orb, ORB, type IOrbController } from "./orb.js";
import { EMPTY_CACHE, type Atom, type Reader } from "./shared.js";

export class StateAtom<T> extends Orb implements Atom<T> {
  #emitController: EmitController | undefined;
  #orbController!: IOrbController;
  #store: T;
  constructor(initialValue: T) {
    let controller!: IOrbController;
    super((c) => {
      controller = c;
    });
    this.#orbController = controller;
    controller.setIntercept(() => {
      this.#emitController?.emit();
      return true;
    });
    this.#store = initialValue;
  }
  set(value: T): undefined {
    if (value === this.#store) {
      return;
    }
    this.#store = value;
    this.#orbController.transmit();
  }
  unwrap(): T {
    return this.#store;
  }
  get [ORB]() {
    // Could remove
    return this;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
}

export const state = <T>(initialValue: T) => new StateAtom(initialValue);

export class AutoDeriveAtom<T> extends Orb implements Atom<T> {
  #emitController: EmitController | undefined;
  #orbController!: IOrbController;
  #store: T | typeof EMPTY_CACHE = EMPTY_CACHE;
  #deriveFn: (read: Reader) => T;
  constructor(derivation: (read: Reader) => T) {
    let controller!: IOrbController;
    super((c) => {
      controller = c;
    });
    this.#orbController = controller;
    controller.setIntercept(() => {
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
    this.#store = this.#orbController.receive((link) =>
      this.#deriveFn(<U>(a: Atom<U>): U => {
        link(a[ORB]);
        return a.unwrap();
      })
    );
    return this.#store;
  }
  get [ORB]() {
    return this;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
}

export const derive = <T>(derivation: (read: Reader) => T) =>
  new AutoDeriveAtom(derivation);
