# 🐄 Wafri AI: Real-Time Multimodal AI Vet

![Deploy to Cloud Run](https://github.com/Tsu-kimi/Wafrivet-Field-Vet/actions/workflows/deploy.yml/badge.svg)
![Google Cloud](https://img.shields.io/badge/GoogleCloud-%234285F4.svg?style=for-the-badge&logo=google-cloud&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini%20Live-%238E75B2.svg?style=for-the-badge&logo=googlebard&logoColor=white)
![Next JS](https://img.shields.io/badge/Next-black?style=for-the-badge&logo=next.js&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)

> **Submission for Gemini Live Agent Challenge 🏆**
> **Tracks:** Best of Live Agents & Best Innovation

Millions of livestock farmers in West Africa lack immediate access to veterinary care. **Wafri AI** is a real-time, vision-enabled AI assistant that fits in a farmer's pocket. 

Using a standard smartphone browser, a farmer points their camera at a sick animal and simply talks. The AI simultaneously analyzes the live video feed (posture, lesions) and the farmer's audio (in Hausa, Yoruba, Pidgin, or English). It responds with a real-time synthesized voice, instantly pushing relevant treatment products to the screen, and handling interruptions naturally. 

🎥 **[Watch the Demo Video Here](https://github.com/Tsu-kimi/Wafrivet-Field-Vet)**

---

## ✨ Key Features

*   **Real-Time Multimodal Interaction**: Streams mic audio and camera frames directly to the Gemini Live API. The AI *sees* what you see and *hears* what you say in real-time.
*   **Natural Interruption Handling**: A true conversation. If the user interrupts, the AI halts its response immediately and adapts to the new input.
*   **Intelligent Tool Integration**: Powered by Google ADK, the agent can search disease databases, update user location, and manage a shopping cart using specialized tools.
*   **Synchronized UI Updates**: When the agent recommends products, it simultaneously informs the AI context and pushes JSON data to the frontend to update the UI on-the-fly.
*   **Seamless Checkout**: Integrated with Paystack for instant payment link generation during the conversation.

---

## 🏗️ Technical Architecture

### Frontend (`/frontend`)
Built with **Next.js 15 (App Router)** and **TypeScript**, the frontend handles:
- **Media Pipeline**: Captures camera frames (every 1.5s) and audio chunks for streaming.
- **WebSocket Gateway**: Maintains a persistent connection to the backend for event-driven updates.
- **Custom Components**: Includes `CameraView`, `ProductCardRow`, `CartBadge`, and `LocationBanner` for a rich, interactive mobile experience..

### Backend (`/backend`)
A **FastAPI** application acting as the orchestrator:
- **Streaming Bridge**: Manages the persistent WebSocket connection between the client and the Gemini Live API.
- **Google ADK Agent**: A sophisticated agent configured with a custom toolset:
    - `disease.py`: RAG-based search for veterinary conditions using Supabase (pgvector).
    - `products.py`: Recommends matched products from the catalog.
    - `location.py`: Geolocation identification for localized care.
    - `cart.py` & `checkout.py`: Full cart lifecycle management and Paystack billing.
- **Session Management**: Persistent state tracking for cart items and confirmed locations.

---

## 🛠️ Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | Next.js / React | Mobile-first UI, WebSockets, MediaStream API |
| **Backend** | Python FastAPI | WebSocket router and ADK orchestrator |
| **Core AI** | Gemini 2.0 Flash | Native Multimodal (STT/TTS/Vision) reasoning |
| **Agent Framework**| Google ADK | Structured tool execution and RAG |
| **Database** | Supabase | PostgreSQL + pgvector for product/disease data |
| **Infrastructure** | Docker / GCR | Fully containerized deployment on Google Cloud |

---

## 📂 Directory Structure

```text
.
├── backend/            # FastAPI, ADK Agent, and Tools
│   ├── agent/          # Agent logic and tool definitions
│   ├── streaming/      # WebSocket bridge and event handling
│   └── main.py         # Entry point for the server
├── frontend/           # Next.js Application
│   ├── app/            # App Router pages and components
│   └── hooks/          # Media and WebSocket hooks
├── infra/              # Terraform/Pulumi infrastructure code
└── deploy/             # Deployment scripts and config
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+) & Python 3.10+
- Google Cloud Project (Gemini API & Vertex AI enabled)
- Supabase Account (PostgreSQL + pgvector)

### 1. Clone the repo

```bash
git clone https://github.com/Tsu-kimi/Wafrivet-Field-Vet.git
cd Wafrivet-Field-Vet
```

### 2. Configure environment variables

1. **Backend `.env`** (server, agent, Supabase, Gemini, Paystack):
   - Copy the provided template at the repo root to a real `.env` file:
     ```bash
     cp .env .env.local-backend   # optional local backup
     cp .env .env                 # FastAPI / ADK reads from this path
     ```
   - In the new `.env`, replace all placeholder values with your own:
     - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
     - `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_API_KEY`
     - `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`
     - `ALLOWED_ORIGINS`, `ENVIRONMENT`, `SESSION_JWT_SECRET`, `SUPABASE_DB_URL`

2. **Frontend `.env.local`** (browser-facing config):
   - From `frontend/`, create or update `.env.local`:
     ```bash
     cd frontend
     cp .env.local .env.local.example || true  # optional snapshot
     ```
   - Ensure the following are set to match your backend and Supabase project:
     - `NEXT_PUBLIC_WS_URL`
     - `NEXT_PUBLIC_API_URL`
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`
     - `GOOGLE_MAPS_KEY`

> **Note:** The backend expects disease and product data (with embeddings) to already exist in your Supabase instance, as used during the demo submission.

### 3. Install backend dependencies and run locally

From the repo root:

```bash
cd backend
pip install -r requirements.txt

# Start the FastAPI + ADK Live server (used by the Next.js app)
python main.py --mode server --host 0.0.0.0 --port 8000
```

The backend will listen on `http://localhost:8000` and expose the WebSocket/HTTP endpoints consumed by the frontend.

### 4. Install frontend dependencies and run locally

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:3000`. Make sure:
- `NEXT_PUBLIC_WS_URL` and `NEXT_PUBLIC_API_URL` point to your backend (e.g. `http://localhost:8000` for local dev, or your Cloud Run URL in production).
- Your browser has permission to access the camera and microphone.

With both servers running, open `http://localhost:3000` in a mobile browser or responsive dev tools to reproduce the full end‑to‑end demo.

### 5. (Optional) Run the text-only golden-path demo

If you want to verify just the agent tools and RAG flow without the streaming layer:

```bash
cd backend
python main.py --mode golden_path
```

This will execute the scripted four‑turn conversation and print the agent responses to stdout.

### 6. Docker / Cloud Run deployment (backend)

The repository includes a production `Dockerfile` for deploying the streaming backend to **Cloud Run**.

1. **Build and test the image locally:**
   ```bash
   # From repo root
   docker build -t wafrivet-backend .

   # Run locally (Cloud Run injects PORT, we mirror that here)
   docker run --rm -e PORT=8080 -p 8080:8080 wafrivet-backend
   ```

2. **Push the image to Artifact Registry or Container Registry** (example for Artifact Registry):
   ```bash
   gcloud auth configure-docker
   docker tag wafrivet-backend \
     us-central1-docker.pkg.dev/<GCP_PROJECT_ID>/wafrivet/wafrivet-backend:latest

   docker push \
     us-central1-docker.pkg.dev/<GCP_PROJECT_ID>/wafrivet/wafrivet-backend:latest
   ```

3. **Deploy to Cloud Run** (HTTP endpoint doubles as WebSocket base URL):
   ```bash
   gcloud run deploy fieldvet-backend \
     --image us-central1-docker.pkg.dev/<GCP_PROJECT_ID>/wafrivet/wafrivet-backend:latest \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --port 8080 \
     --memory 2Gi \
     --max-instances 3
   ```

4. **Wire up secrets via Secret Manager** (recommended for reproducibility & security):
   - Create secrets for each sensitive value in `.env` (e.g. `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `PAYSTACK_SECRET_KEY`, `SESSION_JWT_SECRET`).
   - Re‑deploy Cloud Run with `--set-secrets` flags binding each environment variable to its Secret Manager entry, matching the variable names in `.env`.

Once Cloud Run returns a URL such as:

```text
https://fieldvet-backend-<hash>-<region>.run.app
```

set `NEXT_PUBLIC_WS_URL` and `NEXT_PUBLIC_API_URL` in `frontend/.env.local` to this value, redeploy/restart the frontend, and you will reproduce the same production configuration used for the challenge demo.

---

## 🏆 Credits
Created by the **KURO AMAI STUDIOS** for the Gemini Live Agent Challenge.
