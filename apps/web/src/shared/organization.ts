import { z } from "zod";
import { contentDates } from "./content-dates";
import { LIVE_ORGANIZATION_LIMITS } from "./live-organization-limits";

export { contentDates } from "./content-dates";

const segment = z
  .string()
  .min(1)
  .max(64)
  .refine(
    (value) =>
      value === value.trim() &&
      !/[\\/\u0000-\u001f<>:"|?*]/u.test(value) &&
      ![".", ".."].includes(value)
      &&
      !/[. ]$/.test(value)
      &&
      !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(value),
  );
export const organizationPathSchema = z
  .array(segment)
  .min(1)
  .max(4)
  .refine((path) => path.join("/").length <= 120);
export const organizationResponseSchema = z.strictObject({
  summary: z.string().trim().min(1).max(500),
  matches: z
    .array(
      z.strictObject({
        documentId: z.string().min(1).max(64),
        destination: organizationPathSchema,
        evidence: z.string().trim().min(8).max(180),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
      }),
    )
    .max(LIVE_ORGANIZATION_LIMITS.documents),
  held: z
    .array(
      z.strictObject({
        documentId: z.string().min(1).max(64),
        reason: z.string().trim().min(1).max(240),
      }),
    )
    .max(LIVE_ORGANIZATION_LIMITS.documents),
});

export type OrganizationResponse = z.infer<typeof organizationResponseSchema>;

export type OrganizationDocument = Readonly<{
  id: string;
  name: string;
  excerpt: string;
  sourcePath: readonly string[];
}>;

export type OrganizationRequest = Readonly<{
  instruction: string;
  documents: readonly OrganizationDocument[];
  context?: Readonly<{
    reference: readonly string[] | null;
    destination: readonly string[] | null;
    dateSelections?: Readonly<Record<string, string | null>>;
    destinationSelections?: Readonly<Record<string, readonly string[]>>;
    answers?: readonly unknown[];
    referenceDirectories?: readonly (readonly string[])[];
    liveReview?: boolean;
  }>;
}>;

export function parseOrganizationResponse(
  value: unknown,
  request: OrganizationRequest,
): OrganizationResponse {
  const response = organizationResponseSchema.parse(value);
  const seen = new Set<string>();

  for (const item of [...response.matches, ...response.held]) {
    if (
      seen.has(item.documentId) ||
      !request.documents.some((document) => document.id === item.documentId)
    )
      throw new Error("invalid-organization-document");

    seen.add(item.documentId);
  }

  for (const match of response.matches) {
    if (match.destination[0] === "정리한 자료")
      match.destination = organizationPathSchema.parse(
        match.destination.slice(1),
      );

    if (
      ["받은자료", "정리한자료"].includes(
        match.destination[0].replace(/\s/gu, ""),
      )
    )
      throw new Error("reserved-organization-root");

    const document = request.documents.find(
      (document) => document.id === match.documentId,
    )!;

    if (!document.excerpt.includes(match.evidence))
      throw new Error("ungrounded-organization-evidence");

    const selection = request.context?.dateSelections;
    const chosenDestination =
      request.context?.destinationSelections?.[match.documentId];
    const explicitDestination =
      chosenDestination &&
      JSON.stringify(chosenDestination) === JSON.stringify(match.destination);
    const selected = selection && Object.hasOwn(selection, match.documentId);

    if (selected && selection[match.documentId] !== match.date)
      throw new Error("ignored-review-date");

    if (match.date !== null) {
      const dates = contentDates(document.excerpt);

      if (
        selected
          ? !dates.includes(match.date)
          : dates.length !== 1 || dates[0] !== match.date
      )
        throw new Error("unconfirmed-organization-date");

      if (!explicitDestination && match.destination.at(-1) !== match.date)
        throw new Error("mismatched-organization-date-folder");
    }

    if (
      !explicitDestination
      &&
      match.destination.some(
        (segment) =>
          /^\d{4}-\d{2}-\d{2}$/.test(segment) && segment !== match.date,
      )
    )
      throw new Error("mismatched-organization-date-folder");
  }

  return response;
}
