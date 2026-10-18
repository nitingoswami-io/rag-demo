import { DECLINED, isCited, type ChatMessage } from "@/lib/api";

export default function MessageBubble({
  message,
  selected,
  onSelect,
}: {
  message: ChatMessage;
  selected: boolean;
  onSelect?: () => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2 text-sm text-white">
          {message.content}
        </p>
      </div>
    );
  }

  const sources = message.sources ?? [];
  const declined = message.content.trim() === DECLINED;
  const docs = new Set(sources.filter((s) => isCited(message.content, s)).map((s) => s.source));

  return (
    <div className="flex justify-start">
      <button
        onClick={onSelect}
        className={`max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-2 text-left text-sm leading-relaxed transition ${
          selected
            ? "bg-white ring-2 ring-indigo-500 dark:bg-neutral-950"
            : "bg-neutral-100 hover:ring-1 hover:ring-neutral-300 dark:bg-neutral-800 dark:hover:ring-neutral-600"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500">
          {declined ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Not in the documents, so no guess
            </span>
          ) : (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
              Grounded · cites {docs.size} document{docs.size === 1 ? "" : "s"}
            </span>
          )}
          <span>{sources.length} passages retrieved</span>
          {message.stats && <span>· {(message.stats.total_ms / 1000).toFixed(1)} s</span>}
          <span className="text-indigo-600 dark:text-indigo-400">{selected ? "· evidence shown below" : "· inspect"}</span>
        </p>
      </button>
    </div>
  );
}
