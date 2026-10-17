# RAG Demo: Design Document

**Project:** `rag-demo`, a minimal web app that demonstrates semantic RAG
**Stack:** Python 3.12 · FastAPI · LangChain · PostgreSQL + pgvector · Next.js (App Router, TypeScript, Tailwind) · OpenAI
**Location:** `/Users/nitingoswami/Developer/learning/rag-demo`
**Status:** Approved · 2026-10-17

---

## 1. Purpose and scope

### 1.1 Why
This app is a learning tool. It makes each stage of Retrieval-Augmented Generation (RAG) visible and maps it to the **CoALA** framework:

| RAG stage | CoALA concept | Where it happens in the app |
|---|---|---|
| Upload → chunk → embed → store | **Learning action** writing to **semantic memory** | `POST /upload` → `ingest.py` |
| pgvector collection | **Semantic memory** (long-term) | Postgres `langchain_pg_embedding` |
| Similarity search, top-k | **Retrieval action** | `rag.py` retriever |
| Retrieved chunks + chat history in the prompt | **Working memory** | Prompt template |
| LLM answer | **Reasoning action**, then **external action** (reply) | `ChatOpenAI` |

### 1.2 In scope
- Upload `.pdf`, `.txt` and `.md` files, then index them into pgvector.
- List the indexed documents.
- A chat agent that answers **only** from the uploaded documents and shows its **sources** (file, page, snippet).
- Short chat history, kept on the client and sent with each request.

### 1.3 Out of scope (kept simple on purpose)
Authentication, multi-user isolation, streaming responses, document deletion, reranking, hybrid search, and production deployment. Section 9 lists these as possible next steps.

---

## 2. Use cases

```mermaid
flowchart LR
    U((User))
    subgraph RAG Demo App
        UC1([Upload documents])
        UC2([View indexed documents])
        UC3([Ask a question])
        UC4([Inspect answer sources])
    end
    OAI[[OpenAI API]]
    U --> UC1
    U --> UC2
    U --> UC3
    U --> UC4
    UC1 -. embeddings .-> OAI
    UC3 -. embeddings + chat .-> OAI
```

| ID | Use case | Description |
|---|---|---|
| UC1 | Upload documents | The user picks one or more files. The system splits them into chunks, embeds the chunks and stores them. The UI shows how many chunks were indexed. |
| UC2 | View indexed documents | The UI lists the distinct source filenames in the vector store. |
| UC3 | Ask a question | The user sends a message. The system retrieves the top-4 relevant chunks and the LLM answers from them, or says "I don't know". |
| UC4 | Inspect sources | Each answer shows the chunks it was based on, with filename, page and snippet. This makes retrieval visible. |

---

## 3. Architecture

### 3.1 Component diagram

```mermaid
flowchart TB
    subgraph Browser["Browser (Next.js, :3000)"]
        Page["page.tsx"]
        Up["UploadPanel.tsx"]
        Chat["ChatPanel.tsx"]
        Page --> Up
        Page --> Chat
    end

    subgraph API["FastAPI backend (:8000)"]
        Main["main.py<br/>routes + CORS"]
        Ingest["ingest.py<br/>load · split · store"]
        Rag["rag.py<br/>retrieve · prompt · generate"]
        VS["vectorstore.py<br/>PGVector + OpenAIEmbeddings"]
        Cfg["config.py"]
        Main --> Ingest
        Main --> Rag
        Ingest --> VS
        Rag --> VS
        VS --> Cfg
        Rag --> Cfg
    end

    DB[("PostgreSQL 16 + pgvector<br/>(Docker, :5432)")]
    OAI[["OpenAI API<br/>text-embedding-3-small<br/>gpt-4o-mini"]]

    Up -- "POST /upload (multipart)" --> Main
    Up -- "GET /documents" --> Main
    Chat -- "POST /chat (JSON)" --> Main
    VS -- "SQL / vector search" --> DB
    VS -- "embed()" --> OAI
    Rag -- "chat completion" --> OAI
```

### 3.2 Deployment view (local dev)

```mermaid
flowchart LR
    subgraph Dev["Developer machine"]
        N["node: next dev<br/>localhost:3000"]
        P["python: uvicorn app.main:app<br/>localhost:8000"]
        subgraph Docker
            PG[("pgvector/pgvector:pg16<br/>localhost:5432<br/>volume: pgdata")]
        end
    end
    Cloud[["api.openai.com"]]
    N -- HTTP --> P
    P -- psycopg --> PG
    P -- HTTPS --> Cloud
```

---

## 4. Key flows

### 4.1 Ingestion: upload → chunk → embed → store

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as UploadPanel (Next.js)
    participant API as FastAPI /upload
    participant ING as ingest.py
    participant EMB as OpenAIEmbeddings
    participant DB as pgvector

    User->>UI: Select file(s) and click Upload
    UI->>API: POST /upload (multipart: files[])
    loop each file
        API->>API: Save to temp file
        API->>ING: ingest_file(path, filename)
        ING->>ING: Load (PyPDFLoader / TextLoader)
        ING->>ING: Split (Recursive, 1000 chars, 150 overlap)
        ING->>ING: Attach metadata {source, page}
        ING->>EMB: embed_documents(chunks)
        EMB-->>ING: vectors[1536]
        ING->>DB: INSERT into langchain_pg_embedding
        ING-->>API: chunk_count
    end
    API-->>UI: [{filename, chunks}]
    UI->>API: GET /documents
    API-->>UI: ["policy.pdf", ...]
    UI-->>User: "policy.pdf: 42 chunks indexed"
```

### 4.2 Query: question → retrieve → generate

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as ChatPanel (Next.js)
    participant API as FastAPI /chat
    participant RAG as rag.py
    participant EMB as OpenAIEmbeddings
    participant DB as pgvector
    participant LLM as ChatOpenAI (gpt-4o-mini)

    User->>UI: Type a question
    UI->>API: POST /chat {message, history}
    API->>RAG: answer(message, history)
    RAG->>EMB: embed_query(message)
    EMB-->>RAG: query vector
    RAG->>DB: cosine similarity search, k=4
    DB-->>RAG: top-4 chunks + metadata
    RAG->>RAG: Build prompt (system rules + context + history + question)
    RAG->>LLM: invoke(prompt)
    LLM-->>RAG: grounded answer
    RAG-->>API: {answer, sources[]}
    API-->>UI: 200 OK
    UI-->>User: Answer + collapsible Sources
```

### 4.3 Chat request lifecycle (UI state)

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Sending: user submits message
    Sending --> Showing: 200 OK (answer + sources)
    Sending --> Error: network / 5xx
    Showing --> Idle
    Error --> Idle: user retries
```

---

## 5. Backend design

### 5.1 Module / class diagram

```mermaid
classDiagram
    class Settings {
        +str openai_api_key
        +str database_url
        +str chat_model = "gpt-4o-mini"
        +str embedding_model = "text-embedding-3-small"
        +str collection = "docs"
        +int chunk_size = 1000
        +int chunk_overlap = 150
        +int top_k = 4
    }
    class VectorStoreModule {
        +get_vector_store() PGVector
    }
    class IngestModule {
        +ingest_file(path, filename) int
        -load(path, filename) List~Document~
        -split(docs) List~Document~
    }
    class RagModule {
        +answer(question, history) ChatResponse
        -format_context(docs) str
    }
    class MainApp {
        +POST /upload
        +POST /chat
        +GET /documents
        +GET /health
    }
    class ChatRequest {
        +str message
        +List~Message~ history
    }
    class Message {
        +Literal role  "user|assistant"
        +str content
    }
    class ChatResponse {
        +str answer
        +List~Source~ sources
    }
    class Source {
        +str source
        +int page
        +str snippet
    }

    MainApp --> IngestModule
    MainApp --> RagModule
    IngestModule --> VectorStoreModule
    RagModule --> VectorStoreModule
    VectorStoreModule --> Settings
    RagModule --> Settings
    ChatRequest *-- Message
    ChatResponse *-- Source
    MainApp ..> ChatRequest
    MainApp ..> ChatResponse
```

### 5.2 Modules

| File | Responsibility |
|---|---|
| `app/config.py` | Loads `.env` with `python-dotenv` and exposes a `Settings` object. |
| `app/vectorstore.py` | Builds `OpenAIEmbeddings` and a cached `langchain_postgres.PGVector(collection_name="docs", use_jsonb=True)`. |
| `app/ingest.py` | Picks a loader by file extension, splits with `RecursiveCharacterTextSplitter`, sets `metadata.source = filename`, calls `add_documents`. |
| `app/rag.py` | Retriever `as_retriever(k=4)`, a `ChatPromptTemplate` and `ChatOpenAI(temperature=0)`. Returns the answer and sources. |
| `app/main.py` | FastAPI app with CORS for `http://localhost:3000` and Pydantic models. |

### 5.3 Prompt (system message)
> You are a helpful assistant. Answer the question **using only the context below**. If the answer is not in the context, say *"I don't know based on the uploaded documents."* Cite sources as `[filename p.N]`.
> Context:
> {context}

The last 6 history turns are inserted before the user question.

### 5.4 API contract

| Method | Path | Request | Response |
|---|---|---|---|
| `GET` | `/health` | n/a | `{"status":"ok"}` |
| `POST` | `/upload` | `multipart/form-data`, field `files` (1..n) | `[{"filename":"a.pdf","chunks":42}]` |
| `GET` | `/documents` | n/a | `["a.pdf","notes.md"]` |
| `POST` | `/chat` | `{"message":"...","history":[{"role":"user","content":"..."}]}` | `{"answer":"...","sources":[{"source":"a.pdf","page":3,"snippet":"..."}]}` |

Errors: `400` for an unsupported file type, `500` with a `detail` message for OpenAI or DB failures.

---

## 6. Data model (pgvector, managed by `langchain-postgres`)

```mermaid
erDiagram
    langchain_pg_collection ||--o{ langchain_pg_embedding : contains
    langchain_pg_collection {
        uuid uuid PK
        varchar name "docs"
        jsonb cmetadata
    }
    langchain_pg_embedding {
        varchar id PK
        uuid collection_id FK
        vector embedding "1536 dims"
        varchar document "chunk text"
        jsonb cmetadata "source, page"
    }
```

LangChain creates the tables and the `vector` extension automatically on first use. No migrations are needed. `GET /documents` runs `SELECT DISTINCT cmetadata->>'source'` scoped to the `docs` collection.

---

## 7. Frontend design

```mermaid
flowchart TB
    Page["app/page.tsx<br/>2-column layout (stacks on mobile)"]
    Up["UploadPanel<br/>state: files, uploading, docs[]"]
    Chat["ChatPanel<br/>state: messages[], input, loading"]
    Msg["MessageBubble<br/>answer + Sources (details/summary)"]
    Api["lib/api.ts<br/>uploadFiles · listDocuments · sendChat"]
    Page --> Up
    Page --> Chat
    Chat --> Msg
    Up --> Api
    Chat --> Api
```

- Uses plain `fetch` against `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
- Client components only (`"use client"`), with Tailwind styling.
- No extra packages beyond the `create-next-app` defaults.

---

## 8. Project structure

```
rag-demo/
├── docker-compose.yml
├── README.md                 # quick start + link to docs/DESIGN.md
├── docs/
│   └── DESIGN.md             # this document
├── backend/
│   ├── requirements.txt      # fastapi, uvicorn[standard], python-multipart, langchain,
│   │                         # langchain-openai, langchain-postgres, langchain-text-splitters,
│   │                         # langchain-community, psycopg[binary], pypdf, python-dotenv
│   ├── .env.example          # OPENAI_API_KEY=, DATABASE_URL=postgresql+psycopg://rag:rag@localhost:5432/rag
│   ├── sample/sample.md      # small test document
│   └── app/{config,vectorstore,ingest,rag,main}.py
└── frontend/
    ├── .env.local.example
    ├── lib/api.ts
    └── app/{page.tsx, components/{UploadPanel,ChatPanel,MessageBubble}.tsx}
```

---

## 9. Possible next steps (not built now)
1. **Streaming** answers over SSE.
2. **Hybrid search** (BM25 + vector) and a **reranker**.
3. **Agentic RAG:** let the agent decide when to retrieve (a CoALA decision procedure).
4. **Episodic memory:** persist chat history in Postgres and retrieve past turns.
5. Document delete/re-index, and per-user collections.

---

## 10. Implementation steps
1. Create `rag-demo/`, `docker-compose.yml` and the backend modules described in §5.
2. Scaffold the frontend: `npx create-next-app@latest frontend --ts --tailwind --app --eslint --use-npm --no-src-dir --yes`, then add the components from §7.
3. Save this document as `rag-demo/docs/DESIGN.md` (Mermaid renders on GitHub and in VS Code).
4. Publish a **presentable HTML version** of this document as a private Artifact, with rendered UML diagrams and light/dark themes, and share the link.
5. Write a README with quick-start commands.

## 11. Verification
1. `docker compose up -d` → the DB is healthy.
2. `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`, then set `OPENAI_API_KEY` in `.env` and run `uvicorn app.main:app --reload`.
3. `curl localhost:8000/health` returns ok. `curl -F files=@sample/sample.md localhost:8000/upload` reports more than 0 chunks. A `/chat` question about the sample returns a grounded answer with sources. An unrelated question returns "I don't know…".
4. `cd frontend && npm run dev`, then in the browser upload a PDF, ask a question, and check the answer and source chips.
5. The user supplies `OPENAI_API_KEY` (never hardcoded). If it is missing, I'll ask for it before running live tests.
