import { ChatStream } from "@/components/ChatStream";
import { entityIds } from "@/lib/baseline";
import { memberIds } from "@/lib/committee";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="pt-12">
      <header>
        <span className="label">UCNFI · Research copilot</span>
        <h1 className="display mt-2">Chat</h1>
        <p
          className="prose-body mt-4 max-w-2xl"
          style={{ color: "var(--color-text-muted)" }}
        >
          A Claude-powered research assistant grounded in the full UCNFI
          baseline and the Steering Committee directory. Factual claims
          are cited back to a specific entity or committee member —
          click any citation chip to open it in a side panel.
        </p>
      </header>
      <div className="mt-10">
        <ChatStream
          knownEntityIds={entityIds()}
          knownMemberIds={memberIds()}
        />
      </div>
    </div>
  );
}
