<div align="center">

# 🔬 5G SpecGPT

### AI-Powered 3GPP Specification Assistant

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=for-the-badge&logo=typescript)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql)](https://postgresql.org)
[![Groq](https://img.shields.io/badge/Groq-LLaMA_3.3-orange?style=for-the-badge)](https://groq.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

> **5G SpecGPT** is a full-stack RAG (Retrieval-Augmented Generation) application that lets telecom engineers query 3GPP 5G specifications using natural language. Upload your 3GPP PDFs and ask questions — the AI searches the actual spec text and answers with exact source references.

---

[🚀 Quick Start](#-quick-start) &nbsp;•&nbsp; [🏗 Architecture](#-architecture) &nbsp;•&nbsp; [📡 API Reference](#-api-reference) &nbsp;•&nbsp; [🛠 Tech Stack](#-tech-stack) &nbsp;•&nbsp; [📋 Features](#-features)

</div>

---

## 📋 Features

| Feature | Description |
|---|---|
| 🤖 **AI Chat** | Ask questions in natural language, get answers from real 3GPP specs |
| 📄 **PDF Upload** | Upload any 3GPP specification PDF and it's instantly searchable |
| 🔍 **RAG Search** | Retrieval-Augmented Generation — answers grounded in actual spec text |
| 📌 **Source Citations** | Every answer shows exact spec section, page number, and relevance score |
| 🌊 **Streaming** | Real-time token-by-token streaming responses via Server-Sent Events |
| 🔐 **Auth** | JWT + Google OAuth login with role-based access (User / Admin / Super Admin) |
| 📊 **Admin Dashboard** | Manage users, documents, view analytics and usage statistics |
| 🛡 **5G Guard** | Domain filter ensures only 5G/telecom questions are answered |
| 🗂 **History** | Full conversation history with search and archive |
| 🌙 **Dark Mode** | Full dark/light theme support |

---

## 🏗 Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                                │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                  Next.js 15 Frontend  (Port 3000)           │   │
│   │                                                             │   │
│   │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │   │
│   │   │  Chat    │  │  Admin   │  │ History  │  │  Search  │  │   │
│   │   │  Page    │  │Dashboard │  │  Page    │  │  Page    │  │   │
│   │   └──────────┘  └──────────┘  └──────────┘  └──────────┘  │   │
│   │                                                             │   │
│   │   Zustand State  │  React Query  │  Axios + SSE Client     │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                              │ HTTP / SSE                           │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────────┐
│                    Express.js Backend  (Port 4000)                  │
│                                                                     │
│   ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌─────────┐            │
│   │  Auth   │  │  Chat   │  │ Document │  │  Admin  │            │
│   │ Routes  │  │ Routes  │  │  Routes  │  │ Routes  │            │
│   └────┬────┘  └────┬────┘  └────┬─────┘  └────┬────┘            │
│        └────────────┴────────────┴───────────────┘                 │
│                               │                                     │
│   ┌───────────────────────────▼─────────────────────────────────┐   │
│   │                   Domain Services Layer                     │   │
│   │         AuthService  │  ChatService  │  DocumentService     │   │
│   └───────────────────────────┬─────────────────────────────────┘   │
│                               │                                     │
│   ┌───────────────────────────▼─────────────────────────────────┐   │
│   │                      RAG Pipeline                           │   │
│   │   FiveGGuard → RagRetriever → PromptBuilder → ClaudeService │   │
│   │        ↓              ↓                            ↓        │   │
│   │  [5G Domain    [Keyword Search               [Groq API      │   │
│   │   Filter]       in DB Chunks]                 LLaMA 3.3]    │   │
│   └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
┌─────────▼────────┐  ┌────────▼───────┐  ┌────────▼───────┐
│  PostgreSQL 16   │  │  Redis         │  │  File Store    │
│                  │  │  (Optional)    │  │  (uploads/)    │
│  users           │  │                │  │                │
│  conversations   │  │  Bull Queue    │  │  3GPP PDFs     │
│  messages        │  │  (async jobs)  │  │                │
│  documents       │  │                │  │                │
│  document_chunks │  └────────────────┘  └────────────────┘
│  api_usage       │
└──────────────────┘
```

---

### RAG Pipeline Flow

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                    DOCUMENT INGESTION                           │
  └─────────────────────────────────────────────────────────────────┘

  User uploads PDF
        │
        ▼
  ┌─────────────┐     Validates: PDF only, max 50MB
  │   Multer    │ ──────────────────────────────────────►
  │   Upload    │
  └──────┬──────┘
         ▼
  ┌─────────────┐     Creates DB record (status: PENDING)
  │  Document   │ ──────────────────────────────────────►
  │  Service    │
  └──────┬──────┘
         ▼
  ┌─────────────────────────────────────────────────────┐
  │                Document Processor                   │
  │                                                     │
  │  Step 1: PdfExtractor                               │
  │          └─ pdf-parse → fullText + pages[]          │
  │                                                     │
  │  Step 2: ChunkingService                            │
  │          └─ Split on 3GPP section headers           │
  │          └─ 400 token chunks, 60 token overlap      │
  │          └─ Track pageStart, pageEnd, section       │
  │                                                     │
  │  Step 3: DocumentRepository.createChunks()          │
  │          └─ Bulk INSERT all chunks to PostgreSQL    │
  │                                                     │
  │  Step 4: Mark document status → READY ✅            │
  └─────────────────────────────────────────────────────┘


  ┌─────────────────────────────────────────────────────────────────┐
  │                      CHAT QUERY FLOW                            │
  └─────────────────────────────────────────────────────────────────┘

  User: "What is FR1 and FR2 in 5G NR?"
        │
        ▼
  ┌─────────────┐
  │ FiveGGuard  │  3-tier filter:
  └──────┬──────┘  1. Keyword check (gNB, NR, AMF, PDCP...)
         │         2. Reject list (weather, cooking...)
         │         3. LLM classification (borderline cases)
         ▼
  ┌─────────────┐
  │RagRetriever │  Extract keywords → Search DB via ILIKE
  └──────┬──────┘  Score chunks by keyword matches
         │         Return top 6 most relevant chunks
         ▼
  ┌─────────────┐
  │PromptBuilder│  System prompt: "You are a 5G expert..."
  └──────┬──────┘  Inject spec context + source references
         │         Build conversation history
         ▼
  ┌─────────────┐
  │  Groq API   │  LLaMA 3.3 70B generates answer
  │  (Streaming)│  Streams tokens via Server-Sent Events
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  Chat UI    │  Displays streaming answer
  └─────────────┘  Shows source citations with page refs
```

---

## 🛠 Tech Stack

### Backend

| Category | Technology | Version | Purpose |
|---|---|---|---|
| **Runtime** | Node.js | 20+ | JavaScript runtime |
| **Framework** | Express.js | 4.21 | HTTP server & routing |
| **Language** | TypeScript | 5.7 | Type-safe development |
| **Database** | PostgreSQL | 16 | Primary data store |
| **ORM** | Prisma | 5.22 | Database access layer |
| **AI / LLM** | Groq — LLaMA 3.3 70B | — | Chat completions (free tier) |
| **Embeddings** | Voyage AI — voyage-3-lite | — | Text embeddings 512-dim |
| **Auth** | JWT + bcryptjs | — | Token-based authentication |
| **OAuth** | Google OAuth 2.0 | — | Social login |
| **Queue** | Bull | 1.1 | Async document processing |
| **Cache** | Redis | 7 | Bull queue backend (optional) |
| **Validation** | Zod | 3.23 | Schema validation |
| **Logging** | Winston | 3.17 | Structured JSON logging |
| **PDF** | pdf-parse | 1.1 | PDF text extraction |
| **Upload** | Multer | 1.4 | File upload handling |
| **Rate Limit** | express-rate-limit | 7.4 | API abuse protection |
| **Security** | Helmet | 8.0 | HTTP security headers |

### Frontend

| Category | Technology | Version | Purpose |
|---|---|---|---|
| **Framework** | Next.js App Router | 15.0 | React SSR + routing |
| **Language** | TypeScript | 5.7 | Type-safe development |
| **Styling** | Tailwind CSS | 3.4 | Utility-first CSS |
| **UI Components** | Shadcn/UI + Radix UI | — | Accessible component library |
| **State** | Zustand | 5.0 | Global client state |
| **Server State** | TanStack React Query | 5.0 | API caching & sync |
| **HTTP Client** | Axios | 1.7 | API requests + interceptors |
| **Auth** | NextAuth.js | 4.24 | Session management |
| **Animations** | Framer Motion | 11 | UI transitions |
| **Charts** | Recharts | 2.13 | Analytics visualizations |
| **Forms** | React Hook Form + Zod | — | Form state + validation |
| **Markdown** | react-markdown | 9.0 | Render AI responses |
| **Icons** | Lucide React | 0.468 | Icon library |
| **Fonts** | Inter + JetBrains Mono | — | Google Fonts |
| **Toasts** | react-hot-toast | 2.5 | Notifications |

### Infrastructure

| Category | Technology | Purpose |
|---|---|---|
| **Containerization** | Docker + Docker Compose | Local dev & production |
| **CI/CD** | GitHub Actions | Automated test + deploy pipeline |
| **Monorepo** | npm workspaces | Shared types between packages |
| **Process** | Graceful shutdown | SIGTERM/SIGINT handling |

---

## 📁 Project Structure

```
specgpt/
├── 📁 backend/                        # Express.js API Server (Port 4000)
│   ├── src/
│   │   ├── api/
│   │   │   ├── controllers/           # AuthController, ChatController, DocumentController, AdminController
│   │   │   ├── middleware/            # authenticate, requireRole, validate, upload, rateLimiter
│   │   │   ├── routes/                # authRoutes, chatRoutes, documentRoutes, adminRoutes
│   │   │   └── validators/            # Zod schemas for each route
│   │   ├── core/
│   │   │   ├── ai/                    # ClaudeService (Groq), FiveGGuard, PromptBuilder, RagRetriever
│   │   │   ├── auth/                  # JwtService, PasswordService, GoogleOAuthService
│   │   │   └── rag/                   # PdfExtractor, ChunkingService, DocumentProcessor
│   │   ├── domain/
│   │   │   ├── repositories/          # IUserRepository, IDocumentRepository (interfaces)
│   │   │   └── services/              # AuthService, ChatService, DocumentService, ConversationService
│   │   ├── infrastructure/
│   │   │   ├── database/              # Prisma client, repositories, seed.ts
│   │   │   ├── queue/                 # Bull job queue + document worker
│   │   │   ├── storage/               # FileStorageService (disk I/O)
│   │   │   └── vector-store/          # EmbeddingService (Voyage AI)
│   │   ├── types/                     # shared.ts, express.d.ts
│   │   └── utils/                     # logger.ts (Winston), errors.ts
│   ├── prisma/
│   │   ├── schema.prisma              # 9 models + 5 enums
│   │   └── migrations/                # SQL migration files
│   └── uploads/                       # Uploaded PDF files (gitignored)
│
├── 📁 frontend/                       # Next.js 15 App  (Port 3000)
│   └── src/
│       ├── app/
│       │   ├── (auth)/                # login/, register/
│       │   └── (dashboard)/           # chat/, history/, search/, settings/, admin/
│       ├── components/
│       │   ├── chat/                  # ChatWindow, MessageBubble, SourceCitations, StreamingIndicator
│       │   ├── admin/                 # UserTable, DocumentTable, DocumentUpload, StatsCard, UsageChart
│       │   ├── auth/                  # LoginForm, RegisterForm, GoogleAuthButton
│       │   ├── home/                  # Navbar, VideoHero, FeaturesSection, CTASection, Footer
│       │   └── ui/                    # Shadcn primitives (20+ components)
│       ├── hooks/                     # useStreamChat, useConversations, useProfile
│       ├── lib/api/                   # client.ts (Axios), auth.ts, chat.ts, admin.ts
│       ├── store/                     # authStore.ts, chatStore.ts (Zustand)
│       └── middleware.ts              # Route protection
│
├── 📁 shared/                         # Shared TypeScript types (monorepo)
├── 📁 docker/                         # Dockerfiles + PostgreSQL init SQL
├── 📁 scripts/                        # Utility scripts
├── docker-compose.yml                 # Full stack: Postgres + Redis + Backend + Frontend
├── .env.example                       # Environment variable template
└── README.md
```

---

## 🗄 Database Schema

```
┌─────────────┐        ┌──────────────────┐        ┌────────────────┐
│    users    │        │  conversations   │        │    messages    │
├─────────────┤        ├──────────────────┤        ├────────────────┤
│ id (UUID)   │──┐     │ id (UUID)        │──┐     │ id (UUID)      │
│ email       │  │     │ userId    (FK)   │  │     │ conversationId │
│ name        │  │     │ title            │  │     │ role           │
│ passwordHash│  │     │ isArchived       │  └────►│ content (Text) │
│ avatar      │  │     │ isPinned         │        │ sources (JSON) │
│ role        │  │     │ metadata (JSON)  │        │ tokenCount     │
│ isActive    │  └────►│ createdAt        │        │ modelUsed      │
│ emailVerified│       └──────────────────┘        │ latencyMs      │
└─────────────┘                                    └────────────────┘
       │
       │        ┌──────────────────┐        ┌───────────────────┐
       │        │    documents     │        │  document_chunks  │
       │        ├──────────────────┤        ├───────────────────┤
       └───────►│ id (UUID)        │──┐     │ id (UUID)         │
                │ name             │  │     │ documentId  (FK)  │
                │ fileName         │  │     │ chunkIndex        │
                │ fileSize         │  │     │ content (Text)    │
                │ status           │  │     │ embedding Float[] │
                │ specNumber       │  └────►│ pageStart         │
                │ specTitle        │        │ pageEnd           │
                │ series           │        │ section           │
                │ release          │        │ tokenCount        │
                │ chunkCount       │        └───────────────────┘
                └──────────────────┘

┌──────────────┐        ┌─────────────────┐        ┌────────────────┐
│ oauth_accts  │        │ refresh_tokens  │        │   api_usage    │
├──────────────┤        ├─────────────────┤        ├────────────────┤
│ provider     │        │ tokenHash       │        │ model          │
│ providerUID  │        │ expiresAt       │        │ inputTokens    │
│ accessToken  │        │ isRevoked       │        │ outputTokens   │
└──────────────┘        └─────────────────┘        │ latencyMs      │
                                                   └────────────────┘
```

**Enums:**
- `UserRole` → `USER` · `ADMIN` · `SUPER_ADMIN`
- `DocumentStatus` → `PENDING` · `PROCESSING` · `READY` · `FAILED`
- `SpecSeries` → `TS_23` · `TS_24` · `TS_29` · `TS_33` · `TS_37` · `TS_38` · `O_RAN` · `ETSI`
- `Release` → `REL_15` · `REL_16` · `REL_17` · `REL_18` · `REL_19`

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 13+
- npm 10+

### 1. Clone

```bash
git clone https://github.com/sujoyghoshal/specgpt.git
cd specgpt
```

### 2. Install dependencies

```bash
npm install
cd backend && npm install
cd ../frontend && npm install && cd ..
```

### 3. Configure environment

```bash
cp .env.example .env
```

Minimum required settings in `.env`:

```env
DATABASE_URL=postgresql://specgpt_user:specgpt_pass123@localhost:5432/specgpt
JWT_SECRET=<64 char random string>
JWT_REFRESH_SECRET=<64 char random string>
NEXTAUTH_SECRET=<32 char random string>

# Free at console.groq.com
GROQ_API_KEY=gsk_your_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# Free at dash.voyageai.com
VOYAGE_API_KEY=pa-your_key_here
EMBEDDING_PROVIDER=voyage
EMBEDDING_MODEL=voyage-3-lite
EMBEDDING_DIMENSIONS=512
```

### 4. Set up database

```bash
cd backend
npx prisma migrate dev
npm run db:seed
cd ..
```

### 5. Start

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

### 6. Open browser

```
http://localhost:3000
```

| Role | Email | Password |
|---|---|---|
| 👑 Super Admin | `admin@5gspecgpt.com` | `Admin@SpecGPT2024!` |
| 👤 Demo User | `demo@5gspecgpt.com` | `Demo@SpecGPT2024!` |

### Docker (Alternative)

```bash
docker-compose up -d
```

---

## 📡 API Reference

Base URL: `http://localhost:4000/api/v1`

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | — | Create account |
| `POST` | `/auth/login` | — | Login → returns JWT |
| `POST` | `/auth/refresh` | — | Refresh access token |
| `POST` | `/auth/logout` | JWT | Invalidate session |
| `GET` | `/auth/me` | JWT | Get current user |
| `POST` | `/auth/google` | — | Google OAuth login |

### Chat

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/chat` | JWT | Non-streaming chat |
| `POST` | `/chat/stream` | JWT | **SSE streaming** chat |
| `GET` | `/chat/conversations` | JWT | List conversations |
| `GET` | `/chat/conversations/:id` | JWT | Get conversation + messages |
| `DELETE` | `/chat/conversations/:id` | JWT | Delete conversation |

### Documents

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/documents/upload` | JWT | Upload 3GPP PDF |
| `GET` | `/documents` | JWT | List documents |
| `GET` | `/documents/:id` | JWT | Document details |
| `DELETE` | `/documents/:id` | JWT | Delete document |
| `POST` | `/documents/:id/reprocess` | JWT | Re-run RAG pipeline |

### Admin *(ADMIN role required)*

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/users` | List all users (paginated) |
| `PATCH` | `/admin/users/:id` | Update role / active status |
| `DELETE` | `/admin/users/:id` | Delete user |
| `GET` | `/admin/documents` | All documents with status |
| `GET` | `/admin/analytics/stats` | System stats |
| `GET` | `/admin/analytics/daily` | Daily usage chart data |
| `GET` | `/admin/analytics/top-users` | Top users by token usage |

---

## 🔑 API Keys

| Service | Purpose | Free Tier | Sign Up |
|---|---|---|---|
| **Groq** | Chat LLM — LLaMA 3.3 70B | ✅ Free | [console.groq.com](https://console.groq.com) |
| **Voyage AI** | Text Embeddings | ✅ 200M tokens/month free | [dash.voyageai.com](https://dash.voyageai.com) |
| **Google OAuth** | Social login | ✅ Free | [console.cloud.google.com](https://console.cloud.google.com) |

> 💡 **Corporate firewall?** If Groq API is blocked by your proxy, install [Ollama](https://ollama.ai) locally and set `OLLAMA_BASE_URL=http://localhost:11434` — no internet needed.

---

## 📖 How to Use

### Upload a 3GPP Spec

1. Login as admin → **Admin → Documents → Upload**
2. Download free specs from [3gpp.org/ftp/Specs/latest](https://www.3gpp.org/ftp/Specs/latest/)
3. Recommended first uploads:

| File | Spec | Topic |
|---|---|---|
| `38300-hg0.pdf` | TS 38.300 | NR Overall Description |
| `23501-hf0.pdf` | TS 23.501 | 5G System Architecture |
| `23502-hf0.pdf` | TS 23.502 | 5G System Procedures |
| `38331-h80.pdf` | TS 38.331 | Radio Resource Control |

### Ask Questions

Go to **Chat** and try:

```
"What is the difference between FR1 and FR2?"
"Explain NG-RAN architecture"
"What are the 5GC network functions?"
"How does handover work in 5G NR?"
"What is the role of AMF in the 5G core?"
"Describe the PDCP layer in NR"
```

---

## 🛡 5G Domain Guard

```
User Question
     │
     ▼
┌──────────────────────────────────────┐
│  Tier 1: Fast Keyword Match          │
│  Checks for: NR, gNB, AMF, UE,      │
│  PDCP, RRC, mmWave, beamforming...   │
└────────────────┬─────────────────────┘
                 │ Not matched?
                 ▼
┌──────────────────────────────────────┐
│  Tier 2: Reject List                 │
│  Blocks: weather, cooking, sports,   │
│  general coding, finance...          │
└────────────────┬─────────────────────┘
                 │ Borderline?
                 ▼
┌──────────────────────────────────────┐
│  Tier 3: LLM Classification          │
│  Fast model decides if telecom       │
│  related                             │
└────────────────┬─────────────────────┘
                 │ Approved ✅
                 ▼
          RAG Pipeline → Answer
```

---

## 🏃 Development Commands

```bash
# Tests
cd backend && npm test
cd frontend && npm test

# Type checking
cd backend && npm run typecheck
cd frontend && npm run typecheck

# Database GUI (Prisma Studio)
cd backend && npm run db:studio

# Reset database
cd backend && npm run db:reset

# Re-seed
cd backend && npm run db:seed
```

---

## 🌐 Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `REDIS_URL` | ❌ | — | Redis URL (app works without it) |
| `JWT_SECRET` | ✅ | — | JWT signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | ✅ | — | Refresh token secret |
| `JWT_EXPIRES_IN` | ❌ | `15m` | Access token expiry |
| `JWT_REFRESH_EXPIRES_IN` | ❌ | `7d` | Refresh token expiry |
| `GROQ_API_KEY` | ✅ | — | Groq API key |
| `GROQ_MODEL` | ❌ | `llama-3.3-70b-versatile` | Chat model |
| `VOYAGE_API_KEY` | ✅ | — | Voyage AI embeddings key |
| `EMBEDDING_PROVIDER` | ❌ | `voyage` | `voyage` / `openai` / `ollama` |
| `EMBEDDING_MODEL` | ❌ | `voyage-3-lite` | Embedding model |
| `EMBEDDING_DIMENSIONS` | ❌ | `512` | Vector dimensions |
| `NEXTAUTH_SECRET` | ✅ | — | NextAuth.js secret |
| `NEXTAUTH_URL` | ✅ | `http://localhost:3000` | Frontend URL |
| `GOOGLE_CLIENT_ID` | ❌ | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ❌ | — | Google OAuth secret |
| `UPLOAD_DIR` | ❌ | `./uploads` | PDF storage directory |
| `MAX_FILE_SIZE_MB` | ❌ | `50` | Max upload file size |

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m 'Add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built for 5G Telecom Engineers**

*Groq · Voyage AI · Next.js 15 · PostgreSQL · Express.js · Prisma · TypeScript*

⭐ Star this repo if it helped you!

</div>
