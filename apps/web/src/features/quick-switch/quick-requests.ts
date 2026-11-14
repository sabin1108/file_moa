import { createSignal } from "../../shared/signal";

type Point = Readonly<{
  x: number;
  y: number
}>;

const requests = createSignal<Point>();
export const requestQuickSwitch = requests.emit;
export const subscribeQuickSwitch = requests.subscribe;
