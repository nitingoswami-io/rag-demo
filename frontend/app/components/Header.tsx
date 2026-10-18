import type { Config } from "@/lib/api";

const STEPS = ["Chunk", "Embed", "Store in pgvector", "Retrieve top-k", "Answer with citations"];

export default function Header({ config }: { config: Config | null }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="min-w-0">
        <h1 className="text-lg font-bold tracking-tight">
          Ask your documents
          <span className="ml-2 align-middle text-xs font-medium text-indigo-600 dark:text-indigo-400">RAG demo</span>
        </h1>
        <p className="text-xs text-neutral-500">
          Answers in seconds, grounded in your documents, with a citation for every claim.
        </p>
      </div>
      <ol className="hidden items-center gap-1 text-[11px] text-neutral-500 xl:flex">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1">
            <span className="rounded-full border border-neutral-200 px-2 py-0.5 dark:border-neutral-700">{s}</span>
            {i < STEPS.length - 1 && <span aria-hidden>→</span>}
          </li>
        ))}
      </ol>
      {config && (
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
            config.allow_uploads
              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
          }`}
        >
          {config.allow_uploads ? "Local mode · uploads on" : "Demo mode · sample documents only"}
        </span>
      )}
    </header>
  );
}
