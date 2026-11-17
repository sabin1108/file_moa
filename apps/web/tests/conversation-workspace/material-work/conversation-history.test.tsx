import {expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {ConversationWorkspace} from "../../../src/components/layout/ConversationWorkspace";

it("shows every previous message in the same scroll region with distinct authors",()=>{
 const messages=Array.from({length:8},(_,index)=>({id:`turn-${index}`,author:index%2?"assistant" as const:"user" as const,text:`대화 원문 ${index}`}));
 const html=renderToStaticMarkup(<ConversationWorkspace messages={messages} draft="초안" onDraftChange={()=>{}} onSend={()=>{}} canSend panel={null} intro={null} panelOpen={false} onPanelChange={()=>{}} focusMessageId="turn-7" />);
 for(const message of messages)expect(html).toContain(message.text);
 expect(html).not.toContain("이전 메시지");
 expect(html.match(/data-message-author="user"/g)).toHaveLength(4);
 expect(html.match(/data-message-author="assistant"/g)).toHaveLength(4);
});
