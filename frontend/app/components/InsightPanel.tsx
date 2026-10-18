import { DECLINED, isCited, type ChatMessage, type Config, type Pack } from "@/lib/api";
import Panel from "./Panel";

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-2.5 dark:border-neutral-800">
      <p className="text-[11px] text-neutral-500">{label}</p>
      <p className="text-lg font-semibold leading-tight">{value}</p>
      {hint && <p className="text-[11px] text-neutral-500">{hint}</p>}
    </div>
  );
}

function Step({ n, title, detail, ms }: { n: number; title: string; detail: string; ms?: number }) {
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">{title}</p>
          {ms !== undefined && <span className="shrink-0 font-mono text-[11px] text-neutral-500">{ms} ms</span>}
        </div>
        <p className="text-xs text-neutral-500">{detail}</p>
      </div>
    </li>
  );
}

export default function InsightPanel({
  message,
  pack,
  config,
}: {
  message: ChatMessage | null;
  pack: Pack | null;
  config: Config | null;
}) {
  const stats = message?.stats;
  const sources = message?.sources ?? [];

  if (!message || !stats) {
    return (
      <Panel title="3. How it works" subtitle="Ask a question to see each step measured.">
        <ol className="relative p-4 before:absolute before:bottom-6 before:left-7 before:top-6 before:w-px before:bg-neutral-200 dark:before:bg-neutral-800">
          <Step
            n={1}
            title="Chunk & embed (done ahead of time)"
            detail={`Documents are split into ~${config?.chunk_size ?? 1000}-character chunks (${config?.chunk_overlap ?? 150} overlap) and each chunk becomes a vector with ${config?.embedding_model ?? "an embedding model"}.`}
          />
          <Step n={2} title="Retrieve" detail={`Your question is embedded too, and pgvector finds the ${config?.top_k ?? 4} closest chunks in ${pack?.title ?? "the knowledge base"}.`} />
          <Step n={3} title="Augment" detail="Those chunks go into the prompt, together with your recent turns." />
          <Step n={4} title="Generate" detail={`${config?.chat_model ?? "The model"} answers only from that context and cites each source.`} />
        </ol>
        <div className="mx-4 mb-4 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200">
          <p className="font-medium">Why this matters</p>
          <p className="mt-1">
            Instead of retraining a model, RAG lets it answer from your latest documents. Every answer can be
            checked against its source, and when the answer isn&apos;t in the documents, it says so.
          </p>
        </div>
      </Panel>
    );
  }

  const declined = message.content.trim() === DECLINED;
  const cited = sources.filter((s) => isCited(message.content, s));
  const top = sources[0];
  const docsRetrieved = new Set(sources.map((s) => s.source)).size;

  return (
    <Panel title="3. How this answer was built" subtitle="Each step of the RAG pipeline, measured for the selected answer.">
      <div className="grid grid-cols-3 gap-2 p-4 pb-2">
        <Kpi label="Answer time" value={`${(stats.total_ms / 1000).toFixed(1)} s`} />
        <Kpi label="Chunks searched" value={String(stats.chunks_searched)} hint={`kept top ${sources.length}`} />
        <Kpi
          label={declined ? "Grounding" : "Cited"}
          value={declined ? "No guess" : `${cited.length}/${sources.length}`}
          hint={declined ? "not in docs" : "passages"}
        />
      </div>
      <ol className="relative p-4 before:absolute before:bottom-6 before:left-7 before:top-6 before:w-px before:bg-neutral-200 dark:before:bg-neutral-800">
        <Step
          n={1}
          title="Retrieve"
          ms={stats.retrieve_ms}
          detail={`Embedded the question and compared it with ${stats.chunks_searched} chunks in pgvector. Kept the top ${sources.length} from ${docsRetrieved} document${docsRetrieved === 1 ? "" : "s"}.${top ? ` Best match: ${Math.round(top.score * 100)}% similarity.` : ""}`}
        />
        <Step
          n={2}
          title="Augment"
          detail={`Put ${stats.context_chars.toLocaleString()} characters of context and ${stats.history_turns} earlier turn${stats.history_turns === 1 ? "" : "s"} into the prompt${stats.prompt_tokens ? ` (${stats.prompt_tokens.toLocaleString()} tokens)` : ""}.`}
        />
        <Step
          n={3}
          title="Generate"
          ms={stats.generate_ms}
          detail={
            declined
              ? `${stats.model} found no answer in the context and said so instead of guessing.`
              : `${stats.model} wrote ${stats.completion_tokens ?? "?"} tokens and cited ${new Set(cited.map((c) => c.source)).size} document(s).`
          }
        />
      </ol>
    </Panel>
  );
}
