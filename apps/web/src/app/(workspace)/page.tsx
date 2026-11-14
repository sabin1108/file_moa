import { LiveConversation } from "../../features/conversation-workspace/LiveConversation";
import { liveOrganizationAction, groundedChatAction } from "../actions/live-ai";
import { readUsageAction } from "../actions/ai-usage";
import { getAiProvider } from "../../server/ai/ai-provider";

export default function Home() {
  const provider = getAiProvider();

  return <LiveConversation
    aiProvider={provider}
    organizeAction={liveOrganizationAction.bind(null, provider)}
    groundedAction={groundedChatAction.bind(null, provider)}
    readUsage={readUsageAction}
  />;
}
