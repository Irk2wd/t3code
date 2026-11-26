# Network access in the Irk2wd fork

T3 runs its existing desktop and web interface against a local server. Installed agent CLIs keep their own sign-in, proxy settings and model connections. The fork disables T3 Connect, push publication, product analytics, feedback submission, crash uploads, external OpenTelemetry export and application updates.

## Default destinations

| Operation                             | Destination                                                                                                           | What leaves the machine                                                                                                                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop or browser session            | The local T3 backend, normally on loopback                                                                            | Session authentication, project data and conversation traffic needed to operate the UI                                                                                                                    |
| Model catalog refresh                 | The exact `model-manifest.json` file in `pingdotgg/t3code` on `raw.githubusercontent.com`                             | An HTTPS GET. T3 removes caller-supplied headers, query parameters are refused, and the receiver sees the connection IP                                                                                   |
| T3-managed model and sign-in requests | Designated routes on `auth.openai.com`, `api.openai.com`, `api.anthropic.com` and `generativelanguage.googleapis.com` | Depending on the operation, OAuth data, a model list request, a quota request or the model input. The permitted methods and paths are in the request policy                                               |
| Installed agent CLI                   | The provider and endpoints configured in that CLI                                                                     | T3 passes the selected task and context to the CLI. The CLI controls its network traffic and credential exchange                                                                                          |
| Git operations                        | The remote configured for the project                                                                                 | Git exchanges repository references and objects as required. Run `git remote -v` in the project to see its destinations. SSH configuration, Git URL rewrites, proxies and credential helpers apply to Git |

The Git integration also uses the selected project's forge through its configured CLI for pull request and issue operations. A background status refresh can contact that forge. T3 does not query your account for a star on the upstream project.

The server uses its bundled model manifest when a refresh is unavailable. Application HTTP redirects are rejected before a follow-up request. Product events, device and installation identifiers, feedback transcripts, relay notifications and diagnostic payloads have no external delivery path in this build. Local conversations, logs and resource measurements remain available on the machine running the server.

## Explicit destinations

Set `T3CODE_ALLOWED_ORIGINS` before starting T3 to permit additional HTTPS origins, for example `https://models.example.org:8443`. Separate multiple entries with commas. Each entry grants the exact scheme, hostname and port. It can receive requests, including credentials explicitly configured for it. A wildcard, path, query or fragment grants no access. Restart T3 after changing the list. Mobile builds use `EXPO_PUBLIC_T3CODE_ALLOWED_ORIGINS` for their own server origins. The browser UI uses its serving origin and loopback for its own traffic.

SSH environments use a server you built on the selected host. Set `T3CODE_DEV_REMOTE_T3_SERVER_ENTRY_PATH` to its absolute `apps/server/dist/bin.mjs` path before starting the desktop app. The SSH launcher does not download a release. Development builds using WSL require locally installed build tools and Node headers for native modules.

Model CLIs, the user's Git and SSH executables, an explicitly opened system browser, user-launched terminal commands and build tools run separately from T3's HTTP client. Their own settings determine any additional network access. An explicitly configured proxy can see the connection to the approved destination.

Build this checkout to use these changes. Upstream package managers and app-store downloads deliver the upstream application. [Exact request policy](../../packages/shared/src/networkAccess.ts) · [Local build instructions](../../README.md)
