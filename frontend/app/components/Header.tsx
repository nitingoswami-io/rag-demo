import type { Config } from "@/lib/api";
import { Masthead } from "./demo-look";

const STEPS = ["Chunk", "Embed", "Store in pgvector", "Retrieve top-k", "Answer with citations"];

export const REPO_URL = "https://github.com/nitingoswami-io/rag-demo";
export const DESIGN_DOC_URL = `${REPO_URL}/blob/main/docs/DESIGN.md`;

/** The shared demo masthead (demo-doc skill, live-demo look). */
export default function Header({ config }: { config: Config | null }) {
  return (
    <Masthead
      name="RAG Demo"
      dek="Ask your documents: answers grounded in a knowledge base, with a citation for every claim."
      stages={STEPS.map((label) => ({ label }))}
      links={[
        { href: DESIGN_DOC_URL, label: "Design doc" },
        { href: REPO_URL, label: "Source" },
      ]}
      status={
        config
          ? config.allow_uploads
            ? "Local mode · uploads on"
            : "Demo mode · sample documents only"
          : undefined
      }
    />
  );
}
