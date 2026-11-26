import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/cli";

import { refuseConnect } from "../policy/managedLimits.ts";
import { projectLocationFlags } from "./config.ts";

export const disabledConnect = Effect.fail(refuseConnect({ document: undefined }));
export const headlessFlag = Flag.Boolean("headless").pipe(
  Flag.withDescription("Accepted for compatibility with older T3 Connect commands."),
  Flag.withDefault(false),
);

export const connectSubcommands = [
  Command.make("login", { ...projectLocationFlags, headless: headlessFlag }).pipe(
    Command.withHandler(() => disabledConnect),
  ),
  Command.make("link", {
    ...projectLocationFlags,
    headless: headlessFlag,
    publishOnly: Flag.Boolean("publish-only").pipe(Flag.withDefault(false)),
  }).pipe(Command.withHandler(() => disabledConnect)),
  Command.make("publish", {
    ...projectLocationFlags,
    disable: Flag.Boolean("disable").pipe(Flag.withDefault(false)),
  }).pipe(Command.withHandler(() => disabledConnect)),
  Command.make("status", {
    ...projectLocationFlags,
    json: Flag.Boolean("json").pipe(Flag.withDefault(false)),
  }).pipe(Command.withHandler(() => disabledConnect)),
  Command.make("unlink", projectLocationFlags).pipe(Command.withHandler(() => disabledConnect)),
  Command.make("logout", projectLocationFlags).pipe(Command.withHandler(() => disabledConnect)),
] as const;
