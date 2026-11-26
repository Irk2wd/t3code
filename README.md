<h1 align="center">
  <a href="https://t3.codes">
    <img src="./assets/prod/t3-black-web-icon-192x192.png" width="40" height="40" alt="T3 Code website" />
  </a>
  T3 Code 隐私版 · Unofficial Privacy Fork
</h1>

**本分支已完全移除 T3 Code 自身用于遥测、诊断和反馈的敏感数据上传功能。** T3 不会上报使用统计、设备或安装标识、崩溃报告，也不会将聊天记录和 CLI 日志作为反馈上传。官方 T3 Connect 云中继和应用自动更新均已关闭。

本分支跟随上游 T3 Code 版本，当前同步基线的桌面端和服务端版本均为 **0.1.12**。[对应的上游提交 5ee9eb99d0](https://github.com/pingdotgg/t3code/commit/5ee9eb99d07fae5f9180fa8a5784ace59d072eef)

原有 T3 界面和 Codex、Claude 等 CLI 的登录方式均可继续使用。模型请求发往所选服务，Git 从项目配置的远端拉取，模型目录仍可刷新。[允许的联网地址与发送内容](./docs/user/telemetry.md)

**This fork removes all T3-managed uploads of telemetry, crash reports and feedback, including chat transcripts and CLI logs.** It tracks upstream T3 Code, currently at desktop and server version **0.1.12**, and preserves provider CLI sign-in, model requests, catalog refreshes and Git operations. [Network destinations and data sent](./docs/user/telemetry.md)

<p align="center">
  <a href="https://t3.codes">
    <img src="./.github/readme/hero.webp" width="100%" alt="T3 Code on desktop with a finished Claude thread, next to the phone app asking to approve a command from Codex" />
  </a>
</p>

T3 Code runs the coding agents on your machine and gives them one fast interface. Start a thread at your desk, then approve the next step from your phone.

It works with Claude Code, Codex, Cursor, OpenCode, Grok Build, Antigravity, Kiro, Pi, Muse Code, fx, and any [ACP](./docs/user/providers-acp.md) agent. If an agent is set up on your computer, T3 Code can control it.

## What you get

- **Your subscriptions.** T3 Code does not resell tokens. It drives the agents you are already signed in to.
- **Every agent in one place.** Change models in the middle of a thread. Let Claude hand a task to Codex.
- **Desktop, web, and phone.** One server, and every client shows the same threads. There are apps for iOS and Android.
- **Git built in.** Each thread can work in its own worktree. Review the diff, then commit, push, and open a pull request with one button.
- **Fast.** Performance is a feature here. We measure it, and we treat a dropped frame as a bug.
- **Open.** Source code is MIT licensed. If you don't like something, fork it under your own branding (see [Trademarks and forks](#trademarks-and-forks)).

## Run this fork from source

Use the Node and pnpm versions pinned in the root package manifest. From this checkout, install the workspace dependencies and build the local server and UI.

```sh
pnpm install --frozen-lockfile
pnpm exec vp run build:desktop
node apps/server/dist/bin.mjs
```

Use an already installed and signed-in provider CLI. The desktop development launcher is `pnpm exec vp run dev:desktop`. Application updates are disabled. To upgrade, review the source revision and build it locally.

## "Wait, what are you selling me?"

Nothing. We built T3 Code because we wanted the best possible development experience with agents. We were inspired by existing solutions like the Codex desktop app, Conductor, Claude Desktop and Cursor Glass, but none met our bar.

We wanted something performant, remote-ready, and truly open. If we ever go the wrong direction, we want you to have everything you need to fork the source code and build the tool that you want, under your own name and branding.

## Documentation

- [Install and first run](./docs/user/install.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Source control](./docs/user/source-control.md)
- [Connect outside agents over MCP](./docs/user/outside-agents.md)
- [FAQ](./docs/user/faq.md)

[All docs](./docs/README.md) has the full list.

## Contributing

We have limited review capacity. Small, focused fixes are the most likely to be merged. Features need an approved discussion first.

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before you report a bug or open a pull request.
- Put feature requests in [Ideas](https://github.com/pingdotgg/t3code/discussions/categories/ideas).
- Build from source with the [development runbook](./docs/operations/00_development.md#first-checkout). The [architecture overview](./docs/internals/01_architecture.md) explains how it works.
- Get help in [Discord](https://discord.gg/jn4EGJjrvv).

## License

The source code in this repository is licensed under the [MIT License](./LICENSE).

## Trademarks and forks

The MIT license applies **only to the source code**. It does not grant any rights to T3 Tools, Inc.'s trademarks, branding, or trade dress, including the **T3 Code** name, wordmark, logos, and application icons.

If you fork, redistribute, or build on T3 Code's source code:

- **Use your own branding.** Replace the T3 Code name, wordmark, logos, and application icons in any public fork, redistributed build, website, package, or app store listing.
- **Be explicitly clear that your project is unofficial.** Do not use the T3 Code name, wordmark, logo, or branding in your own projects without making it unmistakably clear that your project is unofficial and not affiliated with or endorsed by T3 Tools, Inc.

Using our name, wordmark, logo, or branding in a way that suggests official status or affiliation is trademark infringement and unlawful. **Any project indicating or implying that it is an official version of T3 Code when it is not will be pursued to the full extent of the law.**

See [TRADEMARK.md](./TRADEMARK.md) for the full trademark and branding policy.
