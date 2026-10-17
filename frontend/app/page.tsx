import ChatPanel from "./components/ChatPanel";
import UploadPanel from "./components/UploadPanel";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold">RAG Demo</h1>
        <p className="text-sm text-neutral-500">
          Upload → chunk → embed → store in pgvector · Ask → retrieve → answer with sources
        </p>
      </header>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <UploadPanel />
        <ChatPanel />
      </div>
    </main>
  );
}
