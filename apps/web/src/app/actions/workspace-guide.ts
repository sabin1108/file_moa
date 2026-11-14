"use server";

import "server-only";
import { headers } from "next/headers";
import { claimWorkspaceGuide } from "../../server/auth/workspace-guide";
import { reportAuthenticationFailure } from "../../server/auth/auth-diagnostics";

export async function claimWorkspaceGuideAction(): Promise<boolean> {
  try {
    return await claimWorkspaceGuide(await headers());
  } catch (error) {
    reportAuthenticationFailure("protocol", error);

    return false;
  }
}
