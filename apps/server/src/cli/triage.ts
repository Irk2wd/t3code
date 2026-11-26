import * as Console from "effect/Console";
import { Command, Flag } from "effect/cli";
import { baseDirFlag } from "./config.ts";

const agentFlag = Flag.Literals("agent", ["claude", "codex", "antigravity"]).pipe(
  Flag.withDescription("Agent CLI to use. Default: ask when multiple are installed."),
  Flag.optional,
);

const modelFlag = Flag.String("model").pipe(
  Flag.withDescription("Model passed through to the agent CLI. Default: the agent's default."),
  Flag.optional,
);

export const triageCommand = Command.make("triage", {
  baseDir: baseDirFlag,
  agent: agentFlag,
  model: modelFlag,
}).pipe(
  Command.withDescription("Show the availability of upstream support reporting."),
  Command.withHandler(() => Console.log("Upstream support reporting is disabled in this build.")),
);
