const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Role = "user" | "assistant";
export type Source = { source: string | null; page: number | null; snippet: string };
export type ChatMessage = { role: Role; content: string; sources?: Source[] };
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

export async function uploadFiles(files: File[]): Promise<UploadResult[]> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return handle(await fetch(`${API_URL}/upload`, { method: "POST", body: form }));
}

export async function listDocuments(): Promise<string[]> {
  return handle(await fetch(`${API_URL}/documents`));
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
): Promise<{ answer: string; sources: Source[] }> {
  return handle(
    await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: history.map(({ role, content }) => ({ role, content })),
      }),
    }),
  );
}
