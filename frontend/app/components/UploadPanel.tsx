"use client";

import { useRef, useState } from "react";
import { deleteDocument, uploadFiles, type PackDocument, type UploadResult } from "@/lib/api";

export default function UploadPanel({
  documents,
  maxMb,
  onChanged,
}: {
  documents: PackDocument[];
  maxMb: number;
  onChanged: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function onUpload() {
    if (!files.length) return;
    setBusy("upload");
    setError(null);
    setResults([]);
    try {
      setResults(await uploadFiles(files));
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(filename: string) {
    if (!confirm(`Delete ${filename}? Its chunks and embeddings will be removed from the database.`)) return;
    setBusy(filename);
    setError(null);
    setResults([]);
    try {
      await deleteDocument(filename);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        id="files"
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.md"
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-neutral-200 file:px-2 file:py-1 file:text-xs dark:file:bg-neutral-800 dark:file:text-neutral-100"
      />
      <p className="text-neutral-500">PDF, TXT or MD · up to {maxMb} MB each · max 5 files</p>
      <button
        onClick={onUpload}
        disabled={!files.length || busy !== null}
        className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === "upload" ? "Indexing…" : `Upload ${files.length ? `(${files.length})` : ""}`}
      </button>

      {results.length > 0 && (
        <ul className="rounded-md bg-emerald-50 p-2 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {results.map((r) => (
            <li key={r.filename}>
              {r.filename}:{" "}
              {r.status === "unchanged"
                ? "already indexed, skipped"
                : r.status === "updated"
                  ? `new version, replaced with ${r.chunks} chunks`
                  : `${r.chunks} chunks indexed`}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="rounded-md bg-red-50 p-2 text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}

      {documents.length === 0 ? (
        <p className="text-neutral-500">Nothing uploaded yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {documents.map((d) => (
            <li
              key={d.filename}
              className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 dark:bg-neutral-950"
            >
              <span className="truncate" title={d.filename}>
                {d.filename}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-neutral-500">
                {d.chunks} chunks
                <button
                  onClick={() => onDelete(d.filename)}
                  disabled={busy !== null}
                  aria-label={`Delete ${d.filename}`}
                  className="rounded px-1.5 py-0.5 text-red-600 hover:bg-red-100 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  {busy === d.filename ? "Deleting…" : "Delete"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
