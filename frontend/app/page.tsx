"use client";

import { useCallback, useEffect, useState } from "react";
import { getConfig, listPacks, type ChatMessage, type Config, type Pack } from "@/lib/api";
import ChatPanel from "./components/ChatPanel";
import EvidencePanel from "./components/EvidencePanel";
import { DemoFooter } from "./components/demo-look";
import Header, { DESIGN_DOC_URL, REPO_URL } from "./components/Header";
import InsightPanel from "./components/InsightPanel";
import KnowledgeBase from "./components/KnowledgeBase";

export default function Home() {
  const [config, setConfig] = useState<Config | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [packId, setPackId] = useState<string>("");
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [selected, setSelected] = useState<Record<string, number | null>>({});
  const [dbVersion, setDbVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refreshPacks = useCallback(async () => {
    try {
      setPacks(await listPacks());
      setDbVersion((v) => v + 1);
    } catch (e) {
      setError(`Can't reach the backend: ${(e as Error).message}`);
    }
  }, []);

  useEffect(() => {
    Promise.all([getConfig(), listPacks()])
      .then(([c, p]) => {
        setConfig(c);
        setPacks(p);
        setPackId((id) => id || p[0]?.id || "");
      })
      .catch((e: Error) => setError(`Can't reach the backend: ${e.message}`));
  }, []);

  const pack = packs.find((p) => p.id === packId) ?? null;
  const messages = threads[packId] ?? [];
  const selectedIndex = selected[packId] ?? null;
  const selectedMessage = selectedIndex !== null ? (messages[selectedIndex] ?? null) : null;

  // Keyed by pack so a reply that arrives after switching packs lands in the right thread.
  function setMessages(id: string, update: (m: ChatMessage[]) => ChatMessage[]) {
    setThreads((t) => ({ ...t, [id]: update(t[id] ?? []) }));
  }

  function clearChat() {
    setThreads((t) => ({ ...t, [packId]: [] }));
    setSelected((s) => ({ ...s, [packId]: null }));
  }

  return (
    <div className="app-shell flex min-h-dvh flex-col bg-neutral-50 text-neutral-900 lg:h-dvh dark:bg-neutral-950 dark:text-neutral-100">
      <Header config={config} />
      {error && (
        <p className="mx-4 mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}
      <main className="grid flex-1 gap-3 px-4 py-3 lg:min-h-0 lg:grid-cols-[19rem_minmax(0,1fr)_21rem] lg:grid-rows-[minmax(0,1fr)_minmax(0,38%)]">
        <div className="min-h-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <KnowledgeBase
            packs={packs}
            packId={packId}
            onSelect={setPackId}
            config={config}
            onChanged={refreshPacks}
          />
        </div>
        <div className="min-h-0 lg:col-start-2 lg:row-start-1">
          <ChatPanel
            pack={pack}
            messages={messages}
            setMessages={setMessages}
            selectedIndex={selectedIndex}
            onSelect={(id, i) => setSelected((s) => ({ ...s, [id]: i }))}
            onClear={clearChat}
          />
        </div>
        <div className="min-h-0 lg:col-start-3 lg:row-start-1">
          <InsightPanel message={selectedMessage} pack={pack} config={config} />
        </div>
        <div className="min-h-0 lg:col-span-2 lg:col-start-2 lg:row-start-2">
          <EvidencePanel message={selectedMessage} packId={packId} dbVersion={dbVersion} />
        </div>
      </main>
      <DemoFooter name="RAG Demo" repoUrl={REPO_URL} designDocUrl={DESIGN_DOC_URL} />
    </div>
  );
}
