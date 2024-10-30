import type { Component } from "@reactive-bench/core/component.ts";

export let scheduler: undefined | ((cb: () => unknown) => undefined);

export function wrapDefer<TComponent extends Component<any>>(
  Component: TComponent
): TComponent {
  return ((props) => {
    const reactions: (() => unknown)[] = [];
    scheduler = (cb) => {
      reactions.push(cb);
    };
    const controller = Component(props);
    const innerRunDeferred = controller.runDeferred;
    const innerCleanup = controller.cleanup;
    return {
      ...controller,
      cleanup: () => {
        innerCleanup?.();
        scheduler = undefined;
      },
      runDeferred: (): undefined => {
        innerRunDeferred?.();
        while (reactions.length) {
          reactions.pop()!();
        }
      },
    };
  }) as TComponent;
}
