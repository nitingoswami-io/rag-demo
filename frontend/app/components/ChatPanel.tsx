"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendChat, type ChatMessage, type Pack } from "@/lib/api";
import MessageBubble from "./MessageBubble";
import Panel from "./Panel";

export default function ChatPanel({
  pack,
  messages,
  setMessages,
  selectedIndex,
  onSelect,
  onClear,
}: {
  pack: Pack | null;
  messages: ChatMessage[];
  setMessages: (packId: string, update: (m: ChatMessage[]) => ChatMessage[]) => void;
  selectedIndex: number | null;
  onSelect: (packId: string, i: number) => void;
  onClear: () => void;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  async function ask(question: string) {
    question = question.trim();
    if (!question || loading || !pack) return;
    const history = messages;
    const packId = pack.id;
    setMessages(packId, () => [...history, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await sendChat(question, history, packId);
      setMessages(packId, (m) => [
        ...m,
        { role: "assistant", content: res.answer, sources: res.sources, stats: res.stats },
      ]);
      onSelect(packId, history.length + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  const docs = pack?.documents.length ?? 0;
  const chunks = pack?.documents.reduce((n, d) => n + d.chunks, 0) ?? 0;
  const asked = new Set(messages.filter((m) => m.role === "user").map((m) => m.content));
  const suggestions = (pack?.questions ?? []).filter((q) => !asked.has(q));

  return (
    <Panel
      title={`2. Ask ${pack ? `· ${pack.title}` : ""}`}
      subtitle={
        pack
          ? `Answers come only from ${docs} document${docs === 1 ? "" : "s"} (${chunks} chunks). Click an answer to inspect its evidence.`
          : "Loading…"
      }
      actions={
        messages.length > 0 && (
          <button
            onClick={onClear}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            Clear chat
          </button>
        )
      }
      bodyClassName="flex flex-col"
    >
      <div ref={scrollRef} className="flex max-h-[60vh] min-h-64 flex-1 flex-col gap-3 overflow-y-auto p-4 lg:max-h-none">
        {messages.length === 0 && pack && (
          <div className="m-auto flex max-w-xl flex-col items-center gap-4 py-6 text-center">
            <div>
              <p className="text-base font-semibold">What would you like to know?</p>
              <p className="mt-1 text-sm text-neutral-500">{pack.problem}</p>
            </div>
            {suggestions.length > 0 && (
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => ask(q)}
                    className="rounded-lg border border-neutral-200 p-3 text-left text-sm hover:border-indigo-400 hover:bg-indigo-50 dark:border-neutral-800 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-neutral-500">
              Tip: ask something the documents don&apos;t cover. The assistant says so instead of guessing.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble
            key={i}
            message={m}
            selected={i === selectedIndex}
            onSelect={m.role === "assistant" && pack ? () => onSelect(pack.id, i) : undefined}
          />
        ))}
        {loading && (
          <p className="animate-pulse text-sm text-neutral-500">Searching the documents and writing an answer…</p>
        )}
        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>
        )}
      </div>

      <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
        {messages.length > 0 && suggestions.length > 0 && (
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {suggestions.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                disabled={loading}
                className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600 hover:border-indigo-400 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            id="question"
            value={input}
            maxLength={1000}
            onChange={(e) => setInput(e.target.value)}
            placeholder={pack ? `Ask about ${pack.title.toLowerCase()}…` : "Ask a question…"}
            className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-neutral-700"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || !pack}
            className="dl-btn dl-btn--primary"
          >
            Send
          </button>
        </form>
      </div>
    </Panel>
  );
}
