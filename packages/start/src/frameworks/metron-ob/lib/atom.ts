import { EmitController, EMITTER } from "#lib/frameworks/metron-o/lib/emitter";
import {
  createTransmitterOrb,
  ORB,
  type TransmitterPackage,
} from "#lib/frameworks/metron-o/lib/orb";
import { type Atom } from "#lib/frameworks/metron-o/lib/shared";

export let state: <T>(initialValue: T) => [Atom<T>, (v: T) => undefined];

// @ts-ignore
class StateAtom<T> implements Atom<T> {
  #emitController: EmitController | undefined;
  #orbPack: TransmitterPackage | undefined;
  #store: T;
  constructor(initialValue: T) {
    this.#store = initialValue;
  }
  // set(value: T): undefined {
  //   if (value === this.#store) {
  //     return;
  //   }
  //   this.#store = value;
  //   this.#orbPack.transmit();
  // }
  unwrap(): T {
    return this.#store;
  }
  get [ORB]() {
    return (this.#orbPack ??= createTransmitterOrb(
      this.#emitController === undefined
        ? () => {
            this.#emitController?.emit();
            return true;
          }
        : () => {
            this.#emitController!.emit();
            return true;
          }
    )).orb;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
  static {
    function set(this: StateAtom<unknown>, value: unknown): undefined {
      if (value === this.#store) {
        return;
      }
      this.#store = value;
      if (this.#orbPack === undefined) {
        this.#emitController?.emit();
      } else {
        this.#orbPack.transmit();
      }
    }
    state = function state(initialValue) {
      const atom = new StateAtom(initialValue);
      return [atom, set.bind(atom)];
    };
  }
}
