import type { RefObject } from "react";
import type { SourcePlanController, SourcePlanState } from "../../store/source-plan-controller";
import { DestinationPlanStep } from "./DestinationPlanStep";

export function PlanDestinationInput({ state, controller, folderName, buttonRef, pickerId, onMove }: {
  state: SourcePlanState; controller: SourcePlanController; folderName: string;
  buttonRef: RefObject<HTMLButtonElement | null>; pickerId: string;
  onMove?: () => void;
}) {
  return <DestinationPlanStep operation={state.operation === "move" ? "move" : "copy"}
    onOperationChange={operation => {
      if (operation === "move" && onMove) onMove();
      else controller.setOperation(operation);
    }} folderName={folderName} destination={state.destination.split("/").filter(Boolean)}
    confirmed={state.destinationConfirmed} onBrowse={() => { void controller.browseDestination(); }}
    buttonRef={buttonRef} pickerId={pickerId} pending={state.phase === "loading"} hasPlan={!!state.result}
    onPlan={() => { void controller.generate(); }} onCancel={controller.cancel} />;
}
