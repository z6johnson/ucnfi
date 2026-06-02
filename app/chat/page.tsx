import { ChatStream } from "@/components/ChatStream";
import { entityIds } from "@/lib/baseline";
import { memberIds } from "@/lib/committee";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="pt-8">
      <header>
        <span className="label">UCOP · Research copilot</span>
        <h1 className="display mt-2">Chat</h1>
      </header>
      <div className="mt-8">
        <ChatStream
          knownEntityIds={entityIds()}
          knownMemberIds={memberIds()}
        />
      </div>
    </div>
  );
}
