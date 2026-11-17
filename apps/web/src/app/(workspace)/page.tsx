import { LiveConversation } from "../../features/conversation-workspace/LiveConversation";
import { liveOrganizationAction, groundedChatAction, searchQueryAction } from "../actions/live-ai";
import { readUsageAction } from "../actions/ai-usage";
import { getAiProvider, getSearchQueryProvider } from "../../server/ai/ai-provider";

export const maxDuration = 180;

export default function Home() {
  const provider = getAiProvider();

  return <LiveConversation
    aiProvider={provider}
    organizeAction={liveOrganizationAction.bind(null, provider)}
    groundedAction={groundedChatAction.bind(null, provider)}
    queryAction={getSearchQueryProvider() ? searchQueryAction.bind(null, provider) : undefined}
    readUsage={readUsageAction}
  />;
}
