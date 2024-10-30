export interface Controller {
  cleanup?: () => undefined;
  runDeferred?: () => undefined;
}

export type Component<TProps, TController extends Controller = Controller> = (
  props: TProps
) => TController;
