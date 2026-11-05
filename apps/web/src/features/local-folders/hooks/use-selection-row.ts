import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
/** Space로 선택하고, 마지막 체크 해제로 숨겨진 checkbox의 초점을 같은 행에 돌린다. */
export function useSelectionRow(selecting: boolean, disabled: boolean, onToggle: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!selecting && ref.current?.contains(document.activeElement) && document.activeElement?.tagName === "INPUT") {
      ref.current.querySelector<HTMLElement>("button, [tabindex='0']")?.focus({ preventScroll: true });
    }
  }, [selecting]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.key !== " " || event.repeat || event.nativeEvent.isComposing || event.ctrlKey || event.altKey || event.metaKey
      || (event.target as HTMLElement).tagName === "INPUT") {
      return;
    }

    event.preventDefault();
    onToggle();
  };

  return { ref, onKeyDown };
}
