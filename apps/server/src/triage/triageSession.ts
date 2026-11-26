// @effect-diagnostics nodeBuiltinImport:off

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { isProcessAlive, readPersistedServerRuntimeState } from "../serverRuntimeState.ts";

export const describeServerProcess = Effect.fn("triage.describeServerProcess")(function* (
  serverRuntimeStatePath: string,
) {
  const state = yield* readPersistedServerRuntimeState(serverRuntimeStatePath);
  if (Option.isNone(state)) {
    return "not running (no server-runtime.json; the server may never have started here)";
  }
  const version =
    state.value.serverVersion === undefined
      ? "version not recorded"
      : `version ${state.value.serverVersion}`;
  if (!isProcessAlive(state.value.pid)) {
    return `not running (state file is stale: pid ${String(state.value.pid)} is dead; last origin ${state.value.origin}, ${version})`;
  }
  return `running (pid ${String(state.value.pid)}, ${state.value.origin}, ${version})`;
});
