"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendChat, type ChatMessage } from "@/lib/api";
import MessageBubble from "./MessageBubble";

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    const history = messages;
    setMessages([...history, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await sendChat(question, history);
      setMessages((m) => [...m, { role: "assistant", content: res.answer, sources: res.sources }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex min-h-[32rem] min-w-0 flex-col rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="border-b border-neutral-200 p-5 dark:border-neutral-800">
        <h2 className="text-lg font-semibold">2. Chat with your documents</h2>
        <p className="text-sm text-neutral-500">
          Each question retrieves the top 4 chunks and the model answers only from them.
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Try: &ldquo;How many weeks of parental leave do I get?&rdquo; after uploading the sample.
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        {loading && <p className="text-sm text-neutral-500">Retrieving and thinking…</p>}
        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 border-t border-neutral-200 p-4 dark:border-neutral-800">
        <input
          id="question"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your documents…"
          className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
