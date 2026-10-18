"use client";

import { useEffect, useState } from "react";
import { isCited, listRows, type ChatMessage, type DbRow } from "@/lib/api";
import Panel from "./Panel";

type Tab = "sources" | "rows";

const th = "sticky top-0 z-10 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-500 dark:bg-neutral-900";
const td = "px-3 py-2 align-top";

export default function EvidencePanel({
  message,
  packId,
  dbVersion,
}: {
  message: ChatMessage | null;
  packId: string;
  dbVersion: number;
}) {
  const [tab, setTab] = useState<Tab>("sources");
  const [data, setData] = useState<{ key: string; limit: number; rows: DbRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${packId}:${dbVersion}`;

  useEffect(() => {
    if (tab !== "rows" || !packId || data?.key === key) return;
    listRows(packId)
      .then((r) => {
        setData({ key, ...r });
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [tab, packId, key, data?.key]);

  const sources = message?.sources ?? [];
  const retrievedIds = new Set(sources.map((s) => s.id));
  const rows = data?.key === key ? data.rows : null;

  const tabs = (
    <div role="tablist" className="flex shrink-0 rounded-md bg-neutral-100 p-0.5 text-xs dark:bg-neutral-800">
      {(
        [
          ["sources", "Answer sources"],
          ["rows", "Database rows"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={tab === id}
          onClick={() => setTab(id)}
          className={`rounded px-2.5 py-1 ${
            tab === id ? "bg-white font-medium shadow-sm dark:bg-neutral-950" : "text-neutral-500"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <Panel
      title="4. Where the information comes from"
      subtitle={
        tab === "sources"
          ? "The passages retrieved for the selected answer, with their document and metadata."
          : "Read-only view of the pgvector table langchain_pg_embedding for this knowledge base. Rows retrieved for the selected answer are highlighted."
      }
      actions={tabs}
    >
      {tab === "sources" ? (
        sources.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500">Ask a question, then click an answer to see its sources here.</p>
        ) : (
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr>
                <th className={th}>Rank</th>
                <th className={th}>Document</th>
                <th className={th}>Page</th>
                <th className={th}>Chunk</th>
                <th className={th}>Similarity</th>
                <th className={th}>Cited</th>
                <th className={th}>Passage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {sources.map((s) => {
                const cited = isCited(message!.content, s);
                return (
                  <tr key={s.rank} className={cited ? "bg-emerald-50/60 dark:bg-emerald-950/30" : ""}>
                    <td className={`${td} font-mono`}>#{s.rank}</td>
                    <td className={`${td} font-medium`}>{s.source}</td>
                    <td className={td}>{s.page ?? "n/a"}</td>
                    <td className={td}>{s.chunk ?? "n/a"}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${Math.max(0, Math.min(1, s.score)) * 100}%` }}
                          />
                        </div>
                        <span className="font-mono">{s.score.toFixed(3)}</span>
                      </div>
                    </td>
                    <td className={td}>
                      {cited ? <span className="text-emerald-700 dark:text-emerald-300">✓ yes</span> : <span className="text-neutral-400">no</span>}
                    </td>
                    <td className={`${td} max-w-xl text-neutral-600 dark:text-neutral-300`}>
                      <p className="line-clamp-3" title={s.snippet}>
                        {s.snippet}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-neutral-400">
                        id {s.id?.slice(0, 8)} · {s.chars} chars · pack {s.pack}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : error ? (
        <p className="p-4 text-sm text-red-600">{error}</p>
      ) : !rows ? (
        <p className="p-4 text-sm text-neutral-500">Loading rows…</p>
      ) : (
        <>
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr>
                <th className={th}>id</th>
                <th className={th}>source</th>
                <th className={th}>page</th>
                <th className={th}>chunk</th>
                <th className={th}>file_hash</th>
                <th className={th}>embedding</th>
                <th className={th}>document (text)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-mono dark:divide-neutral-800">
              {rows.map((r) => (
                <tr key={r.id} className={retrievedIds.has(r.id) ? "bg-indigo-50 dark:bg-indigo-950/40" : ""}>
                  <td className={td} title={r.id}>
                    {r.id.slice(0, 8)}…
                  </td>
                  <td className={`${td} font-sans`}>{r.source}</td>
                  <td className={td}>{r.page ?? "null"}</td>
                  <td className={td}>{r.chunk ?? "null"}</td>
                  <td className={td} title="SHA-256 of the file, used for de-duplication">
                    {r.file_hash ?? "null"}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className="text-neutral-500">vector({r.dims})</span> [
                    {r.embedding_preview.join(", ")}, …]
                  </td>
                  <td className={`${td} max-w-md font-sans text-neutral-600 dark:text-neutral-300`}>
                    <p className="line-clamp-2" title={r.text}>
                      {r.text}
                    </p>
                    <p className="text-[10px] text-neutral-400">{r.chars} chars</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-neutral-500">
            {rows.length} row{rows.length === 1 ? "" : "s"}
            {rows.length >= (data?.limit ?? 0) ? ` (first ${data?.limit})` : ""}. Each row is one chunk: its text,
            a 1536-number embedding and JSONB metadata.
          </p>
        </>
      )}
    </Panel>
  );
}
