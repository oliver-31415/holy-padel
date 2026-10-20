import { useEffect, useRef } from "react";
import type {
  GestureResponderEvent,
  PanResponderGestureState,
  PanResponderInstance,
} from "react-native";
import { PanResponder } from "react-native";

/** How long a press must rest before the chart takes the touch from the card. */
const LONG_PRESS_MS = 300;
/** How far a press may wander before it reads as a scroll rather than a hold. */
const SLOP_PX = 10;

/** Mostly horizontal and past the slop: a sideways drag, not a vertical scroll. */
function isHorizontal(gesture: PanResponderGestureState): boolean {
  return Math.abs(gesture.dx) > SLOP_PX && Math.abs(gesture.dx) > Math.abs(gesture.dy);
}

/**
 * Press-and-hold scrubbing for a chart inside a scroll view. A touch never claims
 * the responder on its own: holding still for LONG_PRESS_MS arms it, and only a
 * sideways move after that claims it. Until then (or for any vertical move) the
 * card keeps the touch and scrolls. Once scrubbing, the responder is not given up.
 */
export function useScrubGesture({
  scrubTo,
  endScrub,
}: {
  /** Called with the touch's x (relative to the chart) on grant and on every move. */
  readonly scrubTo: (x: number) => void;
  /** Called when the touch ends or is taken away; clears the scrub state. */
  readonly endScrub: () => void;
}): { readonly panHandlers: PanResponderInstance["panHandlers"] } {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const armed = useRef(false);
  const scrubbing = useRef(false);

  const disarm = (): void => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
    }
    timer.current = undefined;
    armed.current = false;
  };
  // A pending long-press timer must not outlive the chart.
  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const finish = (): void => {
    disarm();
    scrubbing.current = false;
    endScrub();
  };

  const responder = PanResponder.create({
    // Starts the long-press timer but never claims: the card can still scroll.
    onStartShouldSetPanResponder: () => {
      disarm();
      timer.current = setTimeout(() => {
        armed.current = true;
        timer.current = undefined;
      }, LONG_PRESS_MS);
      return false;
    },
    onMoveShouldSetPanResponder: (_event, gesture) => {
      if (!armed.current) {
        // Moved before the hold finished: this is a scroll or a flick, not a press.
        if (Math.abs(gesture.dx) > SLOP_PX || Math.abs(gesture.dy) > SLOP_PX) {
          disarm();
        }
        return false;
      }
      return isHorizontal(gesture);
    },
    onPanResponderGrant: (event: GestureResponderEvent) => {
      scrubbing.current = true;
      scrubTo(event.nativeEvent.locationX);
    },
    onPanResponderMove: (event: GestureResponderEvent) => {
      if (scrubbing.current) {
        scrubTo(event.nativeEvent.locationX);
      }
    },
    // Keep the touch for the whole drag, so a scroll view cannot take it mid-scrub.
    onPanResponderTerminationRequest: () => !scrubbing.current,
    onPanResponderRelease: finish,
    onPanResponderTerminate: finish,
  });

  return { panHandlers: responder.panHandlers };
}
