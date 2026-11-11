import type { OrganizationResponse } from "./organization";
import type { SampleAiErrorCode, SampleAiUsage } from "./sample-ai";

export type SampleOrganizationResult =
  | Readonly<{
    ok: true;
    organization: OrganizationResponse;
    usage: SampleAiUsage;
    model: string
  }>
  | Readonly<{
    ok: false;
    code: SampleAiErrorCode;
    retryAfter?: number
  }>;

export type SampleOrganizationAction = (input: {
  requestId: string;
  documentIds: string[];
  instruction: string;
  consent: true
}) => Promise<SampleOrganizationResult>;
