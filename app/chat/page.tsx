import { ComingSoon } from "@/components/ComingSoon";

export default function ChatPage() {
  return (
    <ComingSoon section="Chat" cut="Cut 2">
      A streaming chat with Claude, grounded in the full Phase 0 baseline
      via tool use. Answers will carry citations back to specific entities,
      dimensions, and source URLs so every claim is traceable.
    </ComingSoon>
  );
}
