import { handleAuthRequest } from "../../../../server/auth/auth-handler";

export const runtime = "nodejs";

export const GET = handleAuthRequest;
export const POST = handleAuthRequest;
