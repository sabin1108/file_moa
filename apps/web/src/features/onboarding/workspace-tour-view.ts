"use client";

import { createContext, useContext } from "react";
import type { AiRecordPayload } from "../../shared/ai-records";

export type TourRecordKind = AiRecordPayload["type"] | "wiki";
export const WorkspaceTourRecordView = createContext<TourRecordKind | null>(null);
export const useWorkspaceTourRecordView = () => useContext(WorkspaceTourRecordView);
