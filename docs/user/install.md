# Run the T3 Code privacy fork

## Command line

Build this checkout on the machine that will run your agents. Use the Node and pnpm versions in the root package manifest.

```sh
git clone https://github.com/Irk2wd/t3code.git
cd t3code
pnpm install --frozen-lockfile
pnpm exec vp run build:desktop
node apps/server/dist/bin.mjs
```

The last command starts the local server and opens its web interface. Add `serve` to start the server without opening a browser. To launch the desktop development app from this checkout, run `pnpm exec vp run dev:desktop`.

## Providers

Install and sign in to your chosen coding CLI on the host. In **Settings → Providers**, select the installed CLI and set its binary path if it is outside the server's `PATH`. Provider credentials, subscriptions and proxies are managed by that CLI. [Provider guides](./README.md)

### Provider check timeouts

If a working CLI times out during T3 Code's readiness check, increase its probe deadline (in milliseconds) in the server's environment (or systemd override / `service.env`) and restart:

```bash
T3CODE_CODEX_PROBE_TIMEOUT_MS=60000 T3CODE_CLAUDE_PROBE_TIMEOUT_MS=60000 t3 serve
```

| Provider     | Environment variable                   |
| ------------ | -------------------------------------- |
| Codex        | `T3CODE_CODEX_PROBE_TIMEOUT_MS`        |
| Claude       | `T3CODE_CLAUDE_PROBE_TIMEOUT_MS`       |
| Cursor       | `T3CODE_CURSOR_PROBE_TIMEOUT_MS`       |
| Antigravity  | `T3CODE_ANTIGRAVITY_PROBE_TIMEOUT_MS`  |
| Grok         | `T3CODE_GROK_PROBE_TIMEOUT_MS`         |
| Kiro         | `T3CODE_KIRO_PROBE_TIMEOUT_MS`         |
| fx           | `T3CODE_FX_PROBE_TIMEOUT_MS`           |
| Pi           | `T3CODE_PI_PROBE_TIMEOUT_MS`           |
| Muse Code    | `T3CODE_MUSE_PROBE_TIMEOUT_MS`         |
| OpenCode     | `T3CODE_OPENCODE_PROBE_TIMEOUT_MS`     |
| ACP Registry | `T3CODE_ACP_REGISTRY_PROBE_TIMEOUT_MS` |

## Mobile app

Build the same fork for each host or client. The official packages, installer scripts and app stores distribute the upstream application. See the [remote setup](./remote-access.md) and [network destination list](./telemetry.md).
