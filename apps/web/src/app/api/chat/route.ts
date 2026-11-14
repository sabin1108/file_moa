import { handleChat } from "../../../server/chat/chat";
import { after } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleChat(request, after);
}
