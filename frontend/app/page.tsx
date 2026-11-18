"use client";

import { useCallback, useEffect, useState } from "react";
import { getConfig, listPacks, requestAccess, type ChatMessage, type Config, type Pack } from "@/lib/api";
import { clearPass, getPass, setPass, takePassFromUrl } from "@/lib/pass-store";
import ChatPanel from "./components/ChatPanel";
import EvidencePanel from "./components/EvidencePanel";
import {
  AccessDialog,
  AccessNotice,
  DemoFooter,
  readPass,
  type AccessReason,
  type PassInfo,
} from "./components/demo-look";
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
  const [pass, setPassInfo] = useState<PassInfo | null>(null);
  const [accessDialog, setAccessDialog] = useState<AccessReason | null>(null);

  const refreshPacks = useCallback(async () => {
    try {
      setPacks(await listPacks());
      setDbVersion((v) => v + 1);
    } catch (e) {
      setError(`Can't reach the backend: ${(e as Error).message}`);
    }
  }, []);

  // A pass arrives on the emailed link (?pass=...) or is already stored from an earlier visit.
  useEffect(() => {
    const info = readPass(takePassFromUrl() ?? getPass());
    if (!info) clearPass();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setPassInfo(info);
  }, []);

  function openAccess(reason: AccessReason) {
    if (reason === "access_required") {
      clearPass();
      setPassInfo(null);
    }
    setAccessDialog(reason);
  }

  function acceptPass(token: string): boolean {
    const info = readPass(token);
    if (!info) return false;
    setPass(token);
    setPassInfo(info);
    return true;
  }

  function signOut() {
    clearPass();
    setPassInfo(null);
  }

  const gated = Boolean(config?.access_required);

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
      {gated && (
        <AccessNotice
          providers="OpenAI"
          pass={pass}
          repoUrl={REPO_URL}
          onRequest={() => setAccessDialog("access_required")}
          onSignOut={signOut}
        />
      )}
      <AccessDialog
        open={accessDialog !== null}
        reason={accessDialog ?? "access_required"}
        demoName="RAG Demo"
        providers="OpenAI"
        repoUrl={REPO_URL}
        passDays={config?.pass_days}
        onClose={() => setAccessDialog(null)}
        onRequest={requestAccess}
        onPass={acceptPass}
      />
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
            locked={gated && !pass}
            onAccessNeeded={openAccess}
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
