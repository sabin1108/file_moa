import { z } from "zod";

export const personalContextSchema = z.strictObject({
  consent: z.literal(true),
  projectId: z.string().max(64).nullable(),
  entries: z.array(z.strictObject({ id: z.string().max(64), text: z.string().min(1).max(4000), scope: z.enum(["global", "project", "profile"]) })).max(10),
}).refine(value => value.entries.reduce((sum, entry) => sum + entry.text.length, 0) <= 6000);
export type PersonalContext = z.infer<typeof personalContextSchema>;
