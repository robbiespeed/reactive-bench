// import type { Disposer } from "#lib/frameworks/metron-a/lib/shared";

// export const EMITTER = Symbol();

// // export interface Emittable {
// //   readonly [EMITTER]: EmitSubscription;
// // }
// const INERT_HANDLER = () => {};

// class EmitSubscription {
//   #canQueue = true;
//   #next: EmitSubscription | undefined;
//   #prev!: EmitSubscription;
//   #handler!: () => unknown;
//   #enqueue!: (sub: EmitSubscription) => undefined;

//   #emit() {
//     let item = this.#next;
//     while (item !== undefined) {
//       if (item.#canQueue) {
//         item.#canQueue = false;
//         item.#enqueue(item);
//       }
//       item = item.#next;
//     }
//   }

//   dispose() {
//     if (this.#handler === INERT_HANDLER) {
//       return;
//     }
//     this.#canQueue = false;
//     this.#handler = INERT_HANDLER;
//     this.#prev.#next = this.#next;
//   }

//   run(errorHandler: (cause: unknown) => undefined) {
//     this.#canQueue = true;
//     try {
//       this.#handler();
//     } catch (cause) {
//       errorHandler(cause);
//     }
//   }

//   insert(
//     handler: () => unknown,
//     enqueue: (sub: EmitSubscription) => undefined,
//   ): EmitSubscription {
//     const sub = new EmitSubscription();
//     sub.#handler = handler;
//     sub.#enqueue = enqueue;
//     sub.#prev = this;
//     sub.#next = this.#next;
//     this.#next = sub;

//     return sub;
//   }

//   // static Channel = class EmitterChannel {
//   //   #queue: Subscription[] = [];
//   //   #errorHandler: (cause: unknown) => void;
//   //   constructor(errorHandler: (cause: unknown) => void) {
//   //     this.#errorHandler = errorHandler;
//   //   }
//   //   subscribe(emitter: Emitter, handler: () => void): Disposer {
//   //     // const emitter = emittable[EMITTER];
//   //     const subHead = emitter.#subscriptionHead;
//   //     const sub: Subscription = {
//   //       canQueue: true,
//   //       handler,
//   //       queue: this.#queue,
//   //       next: subHead,
//   //       prev: undefined,
//   //     };
//   //     if (subHead !== undefined) {
//   //       subHead.prev = sub;
//   //     }
//   //     emitter.#subscriptionHead = sub;

//   //     return EmitterChannel.#disposer.bind(emitter, sub);
//   //   }
//   //   run(): void {
//   //     const queue = this.#queue;
//   //     const count = queue.length;
//   //     for (let i = 0; i < count; i++) {
//   //       const item = queue[i]!;
//   //       item.canQueue = true;
//   //       try {
//   //         item.handler();
//   //       } catch (err) {
//   //         this.#errorHandler(err);
//   //       }
//   //     }
//   //     if (count < queue.length) {
//   //       queue.splice(0, queue.length - count);
//   //     } else {
//   //       queue.length = 0;
//   //     }
//   //   }
//   //   static #disposer(this: EmitSubscription, sub: Subscription): undefined {
//   //     if (sub.handler === disposedHandler) {
//   //       return;
//   //     }
//   //     sub.canQueue = false;
//   //     sub.handler = disposedHandler;
//   //     const { prev } = sub;
//   //     if (prev === undefined) {
//   //       this.#subscriptionHead = sub.next;
//   //     } else {
//   //       prev.next = sub.next;
//   //     }
//   //   }
//   // };
//   static Controller = class EmitController {
//     #subscriptionHead: EmitSubscription | undefined;
//     emitter = new Emitter(this);

//     emit(): undefined {
//       let item = this.#subscriptionHead;
//       while (item !== undefined) {
//         if (item.#canQueue) {
//           item.#canQueue = false;
//           item.#enqueue(item);
//         }
//         item = item.#next;
//       }
//     }

//     static Emitter = class Emitter {
//       #controller: EmitController;
//       constructor(controller: EmitController) {
//         this.#controller = controller;
//       }
//       static Channel = class EmitterChannel {};
//     };
//   };
// }

// export const EmitController = EmitSubscription.Controller;
// export const Emitter = EmitController.Emitter;
// export const EmitterChannel = Emitter.Channel;

// export type EmitterChannel = InstanceType<typeof EmitterChannel>;
// export type Emitter = InstanceType<typeof Emitter>;
// export type EmitController = InstanceType<typeof EmitController>;
