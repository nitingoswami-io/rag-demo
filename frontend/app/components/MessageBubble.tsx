import type { ChatMessage } from "@/lib/api";

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-indigo-600 text-white"
            : "bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {!isUser && message.sources && message.sources.length > 0 && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-neutral-500">
              Sources ({message.sources.length} retrieved chunks)
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {message.sources.map((s, i) => (
                <li key={i} className="rounded-md border border-neutral-200 p-2 dark:border-neutral-700">
                  <span className="font-medium">
                    {s.source}
                    {s.page ? ` · p.${s.page}` : ""}
                  </span>
                  <p className="mt-1 text-neutral-500">{s.snippet}…</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}
