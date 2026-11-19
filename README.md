# Crown Chess

Crown Chess is a client-side chess web application built with React, TypeScript, Vite, Tailwind CSS, `chess.js`, and single-threaded Stockfish 17.1 Lite WASM.

## Features

Crown Chess runs all game rules, engine analysis, audio synthesis, and state persistence in the browser with no backend server.

- **Play modes.** Play against Stockfish 17.1 across six skill tiers, or play local two-player games with optional automatic board rotation.
- **Time controls.** Choose unlimited play or timed presets across Bullet, Blitz, Rapid, and Classical categories with increment support.
- **Interactive board.** Move pieces by clicking or dragging, view legal move indicators, promote pawns inline, and display best-move hint arrows.
- **Live evaluation and history.** Toggle the Stockfish evaluation bar, step backward and forward through moves, undo moves, and resume unfinished games from `localStorage`.
- **Themes.** Switch between dark mode and light mode, and select Walnut, Sage, or Slate board colors.

## Prerequisites

Install these tools before running the project locally.

- Node.js 20 or newer
- `pnpm` 10 or newer

## Run locally

Follow these steps to install dependencies and start the development server.

1. Clone the repository and open the project directory.

```sh
git clone https://github.com/cjgdizon/crown-chess.git
cd crown-chess
```

2. Install dependencies.

```sh
pnpm install
```

3. Start the Vite development server.

```sh
pnpm dev
```

4. Open the local URL that Vite prints in your terminal.

## Commands

Each script in `package.json` runs one development or verification task.

| Command | Action |
| --- | --- |
| `pnpm dev` | Starts the Vite development server with hot reload. |
| `pnpm typecheck` | Runs `tsc --noEmit` across `src` and `tests`. |
| `pnpm test` | Runs all 6 Vitest test files and 60 unit tests once. |
| `pnpm build` | Runs `tsc --noEmit` and creates the production bundle in `dist/`. |
| `pnpm preview` | Serves the built production bundle locally. |

## Project structure

The codebase separates pure chess rules from browser adapters and React UI components. See [the architecture document](ARCHITECTURE.md) for type contracts, state ownership, and engine scheduling details.

```text
├── public/stockfish/	Single-threaded Stockfish 17.1 Lite JS and WASM files
├── src/domain/			Pure chess rules, clock math, types, contracts, and reducer
├── src/app/			GameStore, PreferencesStore, React hooks, and selectors
├── src/infra/			Stockfish worker queue, UCI parser, Web Audio, storage, and clock ticker
├── src/ui/				Start menu, chessboard SVG components, game panels, and App shell
├── src/styles/			Tailwind CSS entry point and theme custom properties
└── tests/				Unit tests for domain, infra, and app modules
```

## Stockfish difficulty presets

Stockfish 17.1 runs in a single-threaded Web Worker (`public/stockfish/stockfish-17.1-lite-single-03e3232.js`) so static hosts require no cross-origin isolation headers.

| Preset | Approximate Elo | UCI `Skill Level` | Depth cap | Move time | Minimum delay |
| --- | --- | --- | --- | --- | --- |
| Beginner | 600 | 0 | 2 | 150 ms | 350 ms |
| Casual | 1000 | 4 | 4 | 250 ms | 350 ms |
| Club | 1400 | 8 | 6 | 350 ms | 300 ms |
| Advanced | 1800 | 12 | 10 | 500 ms | 250 ms |
| Expert | 2200 | 16 | 14 | 750 ms | 200 ms |
| Master | 2600+ | 20 | 18 | 1100 ms | 150 ms |
