"use client";

import { useEffect, useRef, useState } from "react";
import { deleteDocument, listDocuments, uploadFiles, type UploadResult } from "@/lib/api";

export default function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docs, setDocs] = useState<string[]>([]);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function refresh() {
    try {
      setDocs(await listDocuments());
    } catch (e) {
      setError(`Can't reach the backend: ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    listDocuments()
      .then(setDocs)
      .catch((e: Error) => setError(`Can't reach the backend: ${e.message}`));
  }, []);

  async function onUpload() {
    if (!files.length) return;
    setUploading(true);
    setError(null);
    setResults([]);
    try {
      setResults(await uploadFiles(files));
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function onDelete(filename: string) {
    if (!confirm(`Delete ${filename}? Its chunks and embeddings will be removed from the database.`)) return;
    setDeleting(filename);
    setError(null);
    setResults([]);
    try {
      await deleteDocument(filename);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <div>
        <h2 className="text-lg font-semibold">1. Upload documents</h2>
        <p className="text-sm text-neutral-500">
          Files are split into chunks, embedded and stored in pgvector (semantic memory).
        </p>
      </div>

      <input
        id="files"
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.md"
        onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm dark:file:bg-neutral-800 dark:file:text-neutral-100"
      />

      <button
        onClick={onUpload}
        disabled={!files.length || uploading}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? "Indexing…" : `Upload ${files.length ? `(${files.length})` : ""}`}
      </button>

      {results.length > 0 && (
        <ul className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
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
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Indexed documents ({docs.length})
        </h3>
        {docs.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing indexed yet. Try backend/sample/sample.md.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {docs.map((d) => (
              <li
                key={d}
                className="flex items-center justify-between gap-2 rounded bg-neutral-100 px-2 py-1 dark:bg-neutral-900"
              >
                <span className="truncate">{d}</span>
                <button
                  onClick={() => onDelete(d)}
                  disabled={deleting !== null}
                  aria-label={`Delete ${d}`}
                  className="shrink-0 rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-100 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  {deleting === d ? "Deleting…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
