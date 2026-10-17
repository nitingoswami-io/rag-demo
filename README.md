# RAG Demo

The smallest web app that shows **semantic RAG** end to end: upload documents, then chat with an agent that answers only from them and shows its sources.

**Stack:** FastAPI · LangChain · PostgreSQL + pgvector · Next.js · OpenAI (`gpt-4o-mini`, `text-embedding-3-small`)

The full design, with UML diagrams, is in [docs/DESIGN.md](docs/DESIGN.md).

```
Ingestion:  file → load → chunk (1000/150) → embed → pgvector          (POST /upload)
Query:      question → embed → top-4 similarity search → prompt → LLM → answer + sources   (POST /chat)
```

In CoALA terms, upload is a **learning action** that writes to **semantic memory** (pgvector). Chat is a **retrieval action** that loads chunks into **working memory** (the prompt), which the LLM then reasons over.

## Quick start

Prerequisites: Docker Desktop, Python 3.12, Node 20+, and an OpenAI API key.

```bash
# 1. Database (pgvector)
docker compose up -d

# 2. Backend  → http://localhost:8000  (API docs at /docs)
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then put your OPENAI_API_KEY in .env
uvicorn app.main:app --reload

# 3. Frontend → http://localhost:3000
cd ../frontend
cp .env.local.example .env.local
npm install && npm run dev
```

Upload `backend/sample/sample.md`, then ask *"How many weeks of parental leave do I get?"* To see the grounding rule in action, ask something unrelated: the agent should answer "I don't know based on the uploaded documents."

## Try it with curl

```bash
curl -F files=@backend/sample/sample.md localhost:8000/upload
curl localhost:8000/documents
curl -X POST localhost:8000/chat -H 'Content-Type: application/json' \
  -d '{"message":"What is the meal allowance when travelling?","history":[]}'
```

## Layout

| Path | What it does |
|---|---|
| `backend/app/ingest.py` | Load → split → `add_documents` (embeds and stores) |
| `backend/app/rag.py` | Retrieve top-k → build prompt → `ChatOpenAI` → answer + sources |
| `backend/app/vectorstore.py` | `PGVector` store and the document list query |
| `backend/app/main.py` | FastAPI routes: `/upload`, `/documents`, `/chat`, `/health` |
| `frontend/app/components/` | `UploadPanel`, `ChatPanel`, `MessageBubble` |
| `frontend/lib/api.ts` | `fetch` wrappers for the API |

## Keeping API keys safe

- Your OpenAI key lives only in `backend/.env`, which git ignores, along with every other `.env*` file except the `*.example` templates.
- The key is used only by the backend. The browser only ever sees `NEXT_PUBLIC_API_URL`, so never put a key in a `NEXT_PUBLIC_*` variable.
- A pre-commit hook blocks commits that include env files or anything that looks like an API key. Turn it on once per clone:
  ```bash
  git config core.hooksPath .githooks
  ```
- GitHub secret scanning and push protection are enabled on this repo as a second line of defence.
- If a key is ever committed, revoke it at https://platform.openai.com/api-keys first. Deleting the commit isn't enough, because the key stays in git history and forks.

## Reset the index

```bash
docker compose down -v   # deletes the pgvector volume
```
