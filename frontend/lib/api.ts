// Trim stray whitespace, commas and slashes so a typo in the env var can't break every request.
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim().replace(/[\s,/]+$/, "");

export type Role = "user" | "assistant";

export type Source = {
  rank: number;
  id: string | null;
  source: string | null;
  page: number | null;
  chunk: number | null;
  pack: string | null;
  score: number;
  chars: number;
  snippet: string;
};

export type Stats = {
  retrieve_ms: number;
  generate_ms: number;
  total_ms: number;
  chunks_searched: number;
  context_chars: number;
  history_turns: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  model: string;
};

export type ChatMessage = { role: Role; content: string; sources?: Source[]; stats?: Stats };

export type PackDocument = { filename: string; chunks: number; pages: number | null };

export type Pack = {
  id: string;
  title: string;
  audience: string;
  problem: string;
  value: string;
  questions: string[];
  readonly: boolean;
  documents: PackDocument[];
};

export type Config = {
  allow_uploads: boolean;
  max_upload_mb: number;
  chat_model: string;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  top_k: number;
};

export type DbRow = {
  id: string;
  source: string | null;
  page: number | null;
  chunk: number | null;
  file_hash: string | null;
  chars: number;
  dims: number;
  embedding_preview: number[];
  text: string;
};

export type UploadResult = {
  filename: string;
  chunks: number;
  status: "added" | "updated" | "unchanged";
};

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function getConfig(): Promise<Config> {
  return handle(await fetch(`${API_URL}/config`));
}

export async function listPacks(): Promise<Pack[]> {
  return handle(await fetch(`${API_URL}/packs`));
}

export async function listRows(pack: string): Promise<{ limit: number; rows: DbRow[] }> {
  return handle(await fetch(`${API_URL}/packs/${encodeURIComponent(pack)}/rows`));
}

export async function uploadFiles(files: File[]): Promise<UploadResult[]> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return handle(await fetch(`${API_URL}/upload`, { method: "POST", body: form }));
}

export async function deleteDocument(
  filename: string,
): Promise<{ filename: string; chunks_deleted: number }> {
  return handle(
    await fetch(`${API_URL}/documents/${encodeURIComponent(filename)}`, { method: "DELETE" }),
  );
}

export async function sendChat(
  message: string,
  history: ChatMessage[],
  pack: string,
): Promise<{ answer: string; sources: Source[]; stats: Stats }> {
  return handle(
    await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        pack,
        history: history.slice(-12).map(({ role, content }) => ({ role, content })),
      }),
    }),
  );
}

/** True when the answer cites this source, e.g. "[handbook.md]" or "[policy.pdf p.2]". */
export function isCited(answer: string, s: Source): boolean {
  if (!s.source) return false;
  if (s.page) return answer.includes(`${s.source} p.${s.page}`);
  return answer.includes(`[${s.source}`);
}

export const DECLINED = "I don't know based on the uploaded documents.";
