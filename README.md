<h1 align="center">
  <a href="https://t3.codes">
    <img src="./assets/prod/t3-black-web-icon-192x192.png" width="40" height="40" alt="T3 Code website" />
  </a>
  T3 Code 隐私版 · Unofficial Privacy Fork
</h1>

**本分支已完全移除 T3 Code 自身用于遥测、诊断和反馈的敏感数据上传功能。** T3 不会上报使用统计、设备或安装标识、崩溃报告，也不会将聊天记录和 CLI 日志作为反馈上传。官方 T3 Connect 云中继和应用自动更新均已关闭。

<!-- upstream-sync:baseline -->

本分支跟随上游 T3 Code 的稳定版。当前源码已同步至 **v0.1.13**。[对应的上游提交 bc0f04da94](https://github.com/pingdotgg/t3code/commit/bc0f04da94f64b5e487c598761a43b4cf06b2ac9)

<!-- /upstream-sync:baseline -->

原有 T3 界面和 Codex、Claude 等 CLI 的登录方式均可继续使用。模型请求发往所选服务，Git 从项目配置的远端拉取，模型目录仍可刷新。[允许的联网地址与发送内容](./docs/user/telemetry.md)

需要在 T3 查看 Antigravity 剩余额度时，可运行 `t3 antigravity-quota open`，在官方 CLI 输入 `/usage`，再刷新 T3 的额度面板。配额快照保存在本机。[使用说明](./docs/user/usage.md#show-antigravity-quota-from-the-official-cli)

**This fork removes all T3-managed uploads of telemetry, crash reports and feedback, including chat transcripts and CLI logs.** It tracks the upstream revision linked above and preserves provider CLI sign-in, model requests, catalog refreshes and Git operations. [Network destinations and data sent](./docs/user/telemetry.md)

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

### 上游稳定版同步

GitHub Actions 每 6 小时检查一次上游稳定版，每个新版本开一个 PR。普通说明文档、指定样式表里的颜色或尺寸、发布包清单里单独的版本号变更，以及能确认只在本地界面生效的新功能，都可以在测试和构建通过后自动合并。

网页和桌面共用的 Web 界面支持这类功能。例如，计数换算函数只给页面提供文字，用原来已显示的数值新增可折叠详情和进度显示，或者用只修改组件自身状态的按钮切换显示单位。工作流在只读任务中解析 TypeScript 和 JSX，检查函数、组件及其调用位置，并追踪到页面路由或应用的渲染入口。新增的配套计算测试会实际运行。自动合并要求源码分析、变更检查、隐私测试和桌面构建全部通过，并且合并的是同一提交。

同一个计数一旦参与构造请求，整个版本就留在 PR 里。涉及隐私控制、读取新的敏感数据、加载外部资源、调用用途未知的接口，或分析器无法追踪的服务端及原生代码，也需要人工审核。PR 会给出待审核原因和运行记录。Git 冲突或测试失败时保留 PR，后续轮询尊重已打开或关闭的 PR。

在 Actions 页面手动运行可立即检查。上游版本已经包含在本分支时，手动运行会验证当前构建，定时运行直接结束。人工审核通过后，使用合并提交保留上游历史。同步只更新 fork 源码，本机仍然手动升级。[同步工作流](./.github/workflows/upstream-stable-sync.yml)

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
