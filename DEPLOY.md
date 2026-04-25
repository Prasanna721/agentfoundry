# Deploy to Fly.io

> Brings the full Agent Foundry stack (API + dashboard) live at `https://agent-foundry.fly.dev` (or your chosen name) in ~5 minutes. Free tier is fine.

## What you need to do once

```bash
# 1) install fly CLI
brew install flyctl                  # macOS
# or: curl -L https://fly.io/install.sh | sh

# 2) sign in (opens a browser)
fly auth login
```

## Deploy

From the repo root:

```bash
# 3) initial app + region setup (uses our committed fly.toml)
fly launch --no-deploy --copy-config --name agent-foundry --region sjc
# (if "agent-foundry" is taken, pick a different --name, e.g. agent-foundry-yourname)

# 4) persistent disk for data/agents.json + data/forges.json
fly volumes create foundry_data --size 1 --region sjc

# 5) push the secrets (paste from your local .env)
fly secrets set \
  CIRCLE_API_KEY="$(grep ^CIRCLE_API_KEY .env | cut -d= -f2-)" \
  CIRCLE_ENTITY_SECRET="$(grep ^CIRCLE_ENTITY_SECRET .env | cut -d= -f2-)" \
  CIRCLE_WALLET_SET_ID="$(grep ^CIRCLE_WALLET_SET_ID .env | cut -d= -f2-)" \
  PINATA_JWT="$(grep ^PINATA_JWT .env | cut -d= -f2-)" \
  PINATA_API_KEY="$(grep ^PINATA_API_KEY .env | cut -d= -f2-)" \
  PINATA_API_SECRET="$(grep ^PINATA_API_SECRET .env | cut -d= -f2-)" \
  GEMINI_API_KEY="$(grep ^GEMINI_API_KEY .env | cut -d= -f2-)" \
  AGENT_FOUNDRY_CONTRACT="$(grep ^AGENT_FOUNDRY_CONTRACT .env | cut -d= -f2-)"

# 6) ship
fly deploy

# 7) open the live dashboard
fly open
```

**That's it.** The URL `https://agent-foundry.fly.dev` is now public. Anyone in the world can:

- Visit and see the dashboard
- POST `/agents/register` to create their own wallet
- Run Codex/Claude pointed at this URL with their issued apiToken
- Watch real USDC move on Arc Testnet

## Verify

```bash
# from any machine with internet:
curl https://agent-foundry.fly.dev/healthz
curl https://agent-foundry.fly.dev/api/stats
curl -X POST https://agent-foundry.fly.dev/agents/register \
  -H 'Content-Type: application/json' -d '{"name":"demo-test"}'
```

## Bringing pre-existing forge history

The `data/agents.json` and `data/forges.json` from your local run get **left behind** because the production volume is empty. To copy them to the live deploy:

```bash
fly ssh console
# inside the container:
cat > /app/data/agents.json <<'EOF'
[ ...paste contents of local data/agents.json... ]
EOF
cat > /app/data/forges.json <<'EOF'
{ ...paste contents of local data/forges.json... }
EOF
exit
fly apps restart agent-foundry
```

(Or run the demo fresh on the live deploy — same result, takes ~4 min.)

## Update the deployed copy

```bash
git pull   # or whatever
fly deploy
```

## Troubleshooting

- **`fly launch` says the name is taken** → pick a different `--name`. Update `fly.toml`'s `app =` line and `nav-contract` link in the dashboard if you want.
- **Healthcheck failing** → `fly logs` to see what's up. Most likely a missing secret.
- **App goes to sleep** → free tier auto-stops machines after idle. The next request wakes it (~3s cold start). Set `min_machines_running = 1` in `fly.toml` (already set).
- **CORS issues from a different origin** → currently CORS is wide open in dev; tighten if needed by adding Hono's `cors` middleware.

## What I do NOT need from you for this deploy

- Public domain (Fly gives you `agent-foundry.fly.dev` free)
- HTTPS cert (Fly issues one automatically)
- A registry account — Fly builds the image for you

## What I DO need from you

1. Run `brew install flyctl && fly auth login`
2. Tell me when you're authed and I'll run the rest of the commands myself.

(Or paste your fly auth token, but the browser flow is faster + safer.)
