<p align="center">
  <img src="public/icon.svg" alt="NestLife" height="72">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-Personal%20Free%20·%20Commercial%20Paid-green">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D22.5-blue">
  <img src="https://img.shields.io/badge/Stack-Next.js%2016%20·%20SQLite%20·%20Tailwind-blueviolet">
  <img src="https://img.shields.io/badge/README-中文-green">
</p>

# NestLife™

> Run your life like a company: attitude sets direction, goals define the path, tasks drive execution, reviews feed back, knowledge supports decisions, and AI executes on command.

- 📋 **Daily Board**: tasks with natural-language input ("submit the report at 3pm tomorrow" auto-parses date/time/priority) + reminders + daily schedule
- 🔄 **Review Loop**: daily / weekly / monthly reviews with auto statistics, one-click "next steps → tasks"
- 🏗️ **Career**: projects + milestones + automatic activity sensing
- 🌱 **Growth**: habit tracking + execution heatmap
- 🤖 **AI Assistant** (optional): "it's done" → auto-completes the task; manage decisions, menus, projects by conversation
- 📚 **Knowledge Base**: self-hosted docs + full-text search with synonym expansion
- 📌 **Decisions / Content / Personalized settings**

**Your data stays 100% on your machine** (SQLite, zero external dependencies). Free for personal / non-commercial use.

[简体中文 README](./README.md) · [中文安装说明](./INSTALL.md) · [中文使用说明](./USAGE.md) · [中文配置说明](./CONFIG.md)

---

## Why NestLife

Most "life management" tools either keep your data in the cloud or fragment your workflow. NestLife is built to:

- **Keep data private**: everything lives in local SQLite — works offline, migration is copying one directory
- **Close the loop**: goals → tasks → execution → review → decisions, one continuous chain
- **Let AI do real work**: an optional AI execution layer lets you operate the whole system in natural language (tasks / decisions / menus), with cloud or local models
- **Stay minimal**: white cards, thin borders, direct information — no flashy dashboards

## 👋 Where to start (1 minute)

**What this is**: a personal growth & career management app that runs on your own machine — your data stays with you, works offline.

**Pick the doc that matches you**:

| You are… | Read this |
|---|---|
| Already installed — just want to use it | **[USAGE.md](./USAGE.md) How to use** (plain language) |
| Installing it yourself (needs a terminal) | **[INSTALL.md](./INSTALL.md) Install** (step by step) |
| Configured it — want to change settings (password / AI / data location) | **[CONFIG.md](./CONFIG.md) Config** |
| Something broke | **[DEPLOY.md](./DEPLOY.md) Troubleshoot** |

> Free for personal / non-commercial use; a commercial license is only required for organizations / commercial use (see the end of this file).

## Quick Start

> ⚠️ The steps below need a terminal. Not comfortable with one? Ask a tech-savvy friend to install it for you, or use Docker Desktop (GUI).

Requires **Node.js ≥ 22.5** (built-in `node:sqlite`) or Docker.

```bash
# Option 1: Docker (easiest)
cp .env.example .env
docker compose up -d
# Open http://localhost:3100

# Option 2: Run directly
npm ci && npm run build
NESTLIFE_AUTH=1 NESTLIFE_ADMIN_PASSWORD=your-password npm run start -- -p 3100
```

The first launch auto-initializes (default menus / schedule / habits) — zero config to start using. See [INSTALL.md](./INSTALL.md) for full setup.

**Access from phone / other devices**: open `http://<server-ip>:3100` in a browser on the same network and sign in with the password set via `NESTLIFE_ADMIN_PASSWORD` (`localhost` on the server itself needs no login). See [USAGE.md](./USAGE.md) for daily usage.

## AI Assistant (optional)

| Need | Setup |
|---|---|
| Online chat | Fill any OpenAI-compatible endpoint (DeepSeek, etc.) in Settings |
| Offline chat | Install Ollama → point to `http://localhost:11434/v1/chat/completions` |
| "Talk & execute" | Install OpenClaw → one-click connect in Settings |

Without AI, tasks / reviews / knowledge / decisions all work normally.

## License

**Dual-licensed**: free for personal / student / educational / non-profit use (use, modify, redistribute with copyright notice kept); organizations or **any commercial use requires a paid license**. See [LICENSE](./LICENSE).

© 2026 重庆巢外科技有限责任公司 · NestLife™

## Contributing

Issues, PRs and suggestions welcome. Development:

```bash
npm run dev -- -p 3100   # development
npm test                 # unit + API tests
npm run test:auth        # auth tests
npm run test:init        # first-run tests
```
