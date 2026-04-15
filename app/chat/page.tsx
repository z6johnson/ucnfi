import { ChatStream } from "@/components/ChatStream";
import { entityIds } from "@/lib/baseline";

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
          A Claude-powered research assistant grounded in the full
          Phase 0 baseline. Every factual claim is cited back to a
          specific entity — click any{" "}
          <code>[entity_id]</code> chip to open that entity in the
          baseline explorer.
        </p>
      </header>
      <div className="mt-10">
        <ChatStream knownEntityIds={entityIds()} />
      </div>
    </div>
  );
}
