# Space Debris & Rocket Body Tracker

A comprehensive full-stack web application designed for real-time tracking, astrodynamics propagation, and 3D visualization of active satellites, space debris, and rocket bodies. 

This system ingests Two-Line Element (TLE) sets from CelesTrak, calculates orbital mechanics, and predicts potential conjunctions (collisions) using continuous streaming telemetry.

## 🚀 Features

- **Real-Time Astrodynamics:** Fetches and synchronizes live TLE data from CelesTrak across multiple orbital groups (Starlink, Weather, Active Stations, Debris Fields).
- **Interactive 3D Earth Visualization:** Immersive real-time rendering of the globe and orbiting objects using `Three.js` and `@react-three/fiber`.
- **Conjunction Alerts:** Calculates pairwise distances between thousands of objects using `satellite.js` to detect potential near-misses and collisions within a specified safety threshold.
- **Live Telemetry Dashboard:** A sleek, high-tech React interface featuring real-time UTC clocks, live object counts, and websocket connection status.
- **Offline Fallback Catalog:** Ships with a base static catalog (`catalog_16063.tle`) containing over 16,000 objects to ensure system functionality even when CelesTrak is unreachable.
- **AI Integration (Gemini):** Integrated with Google Gemini API for intelligent insights and analytics on orbital activities.

## 🛠️ Technology Stack

- **Frontend:** React 19, Vite, TypeScript, TailwindCSS v4, React Router
- **3D Graphics:** Three.js, React Three Fiber (`@react-three/fiber`), Drei (`@react-three/drei`)
- **Animations:** GSAP, Motion
- **Backend:** Node.js, Express, WebSockets (`ws`)
- **Astrodynamics & Math:** `satellite.js`
- **Database:** `sql.js` (SQLite WASM)
- **AI / LLM:** `@google/genai`, `openai`

## 📦 Project Structure

- `/src`: Frontend React components, 3D Canvas, pages (Mission Control, Earth Tracking, Alert Center), and styles.
- `/server`: Node.js Express backend, WebSocket handlers, `tleFetcher.ts` (CelesTrak Sync logic), and SQLite database setup.
- `/data`: Local static datasets, including `catalog_16063.tle`.
- `server.ts`: The main entry point for the backend server and Vite middleware in development mode.

## ⚙️ Quick Start

### Prerequisites
- Node.js (v20+ recommended)
- npm or bun

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
Create a `.env` file in the root directory and add your API keys:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```
*(You can use `.env.example` as a template)*

### 3. Run Development Server
```bash
npm run dev
```
This will start both the Express backend and the Vite frontend simultaneously. The application will be accessible at `http://localhost:3000` (or whichever port Vite/Express binds to).

### 4. Build for Production
```bash
npm run build
npm start
```
This compiles the React app via Vite and bundles the Node.js server using `esbuild` into a single standalone `dist/server.cjs` file.

## 📡 How Data Synchronization Works
The platform employs a hybrid data ingestion model:
1. It loads a base catalog of ~16,000 objects from local storage.
2. When the user clicks **"Sync CelesTrak"**, the Node.js server makes concurrent live requests to 16 different CelesTrak group endpoints.
3. Matching satellites are updated in-place with real-time orbital elements.
4. If network requests time out, the system safely falls back to the local database, ensuring uninterrupted tracking.
