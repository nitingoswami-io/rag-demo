"use client";

import type { Config, Pack } from "@/lib/api";
import Panel from "./Panel";
import UploadPanel from "./UploadPanel";

export default function KnowledgeBase({
  packs,
  packId,
  onSelect,
  config,
  onChanged,
}: {
  packs: Pack[];
  packId: string;
  onSelect: (id: string) => void;
  config: Config | null;
  onChanged: () => Promise<void>;
}) {
  return (
    <Panel title="1. Pick a knowledge base" subtitle="Each one is a real-world use case with its own documents.">
      <div className="flex flex-col gap-2 p-3">
        {packs.map((p) => {
          const active = p.id === packId;
          const chunks = p.documents.reduce((n, d) => n + d.chunks, 0);
          return (
            <div
              key={p.id}
              className={`rounded-lg border transition ${
                active
                  ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-500 dark:bg-indigo-950/40"
                  : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700"
              }`}
            >
              <button onClick={() => onSelect(p.id)} className="w-full p-3 text-left" aria-pressed={active}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{p.title}</span>
                  <span className="shrink-0 text-[11px] text-neutral-500">
                    {p.documents.length} docs · {chunks} chunks
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-neutral-500">{p.audience}</p>
              </button>

              {active && (
                <div className="flex flex-col gap-3 border-t border-indigo-200 px-3 pb-3 pt-2 text-xs dark:border-indigo-900">
                  <div>
                    <p className="font-medium text-neutral-500">The problem</p>
                    <p className="mt-0.5">{p.problem}</p>
                  </div>
                  <div>
                    <p className="font-medium text-indigo-700 dark:text-indigo-300">The value</p>
                    <p className="mt-0.5">{p.value}</p>
                  </div>
                  {p.readonly ? (
                    <div>
                      <p className="mb-1 font-medium text-neutral-500">Documents (read-only samples)</p>
                      <ul className="flex flex-col gap-1">
                        {p.documents.map((d) => (
                          <li
                            key={d.filename}
                            className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 dark:bg-neutral-950"
                          >
                            <span className="truncate" title={d.filename}>
                              {d.filename}
                            </span>
                            <span className="shrink-0 text-neutral-500">
                              {d.pages ? `${d.pages} pages · ` : ""}
                              {d.chunks} chunks
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <UploadPanel
                      documents={p.documents}
                      maxMb={config?.max_upload_mb ?? 5}
                      onChanged={onChanged}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mx-3 mb-3 rounded-lg border border-dashed border-neutral-300 p-3 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
        <p className="font-medium text-neutral-800 dark:text-neutral-200">Your privacy</p>
        {config?.allow_uploads ? (
          <p className="mt-1">
            Local mode. Uploaded files are stored in your local Postgres database and their text is sent to
            OpenAI for embeddings and answers. Delete a file to remove all of its chunks.
          </p>
        ) : (
          <p className="mt-1">
            This demo only searches the fictional sample documents above. You can&apos;t upload files, and
            your questions aren&apos;t stored. Each question is sent to OpenAI only to generate the answer.
          </p>
        )}
      </div>
    </Panel>
  );
}
