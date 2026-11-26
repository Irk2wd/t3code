import type { AgentAwarenessThread } from "../orchestration-v2/ProjectionStore.ts";
import { type EnvironmentId, type Project, type ThreadId } from "@t3tools/contracts";
import { projectThreadAwarenessV2, subagentAwaitsUser } from "@t3tools/shared/agentAwareness";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";

export class AgentAwarenessRelay extends Context.Service<
  AgentAwarenessRelay,
  {
    readonly publishThread: (threadId: ThreadId) => Effect.Effect<void>;
    readonly drain: Effect.Effect<void>;
    readonly requestCatchUp: () => Effect.Effect<void>;
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  }
>()("t3/relay/AgentAwarenessRelay") {}

function terminalWorkSinceStart(thread: AgentAwarenessThread, startedAt: number): boolean {
  return (
    thread.latestRunCompletedAt != null &&
    DateTime.toEpochMillis(thread.latestRunCompletedAt) > startedAt
  );
}

export function resolveAgentAwarenessRelayActiveThreadIds(input: {
  readonly environmentId: EnvironmentId;
  readonly startedAt: number;
  readonly projects: ReadonlyArray<Pick<Project, "id" | "title">>;
  readonly threads: ReadonlyArray<AgentAwarenessThread>;
}): ReadonlyArray<ThreadId> {
  const projectById = new Map(input.projects.map((project) => [project.id, project]));
  return input.threads
    .filter((thread) => {
      // Publishing a waiting subagent republishes its top-level thread.
      if (subagentAwaitsUser(thread)) return true;
      const project = projectById.get(thread.projectId);
      if (!project) {
        return false;
      }
      const state = projectThreadAwarenessV2({
        environmentId: input.environmentId,
        project,
        thread,
      });
      return (
        state !== null &&
        (state.phase !== "completed" && state.phase !== "failed"
          ? true
          : terminalWorkSinceStart(thread, input.startedAt))
      );
    })
    .map((thread) => thread.id);
}

/** @public */
export const make = Effect.succeed(
  AgentAwarenessRelay.of({
    publishThread: Effect.fn("AgentAwarenessRelay.publishThread")(() => Effect.void),
    drain: Effect.void,
    requestCatchUp: Effect.fn("AgentAwarenessRelay.requestCatchUp")(() => Effect.void),
    start: Effect.fn("AgentAwarenessRelay.start")(() => Effect.void),
  }),
);

export const layer = Layer.effect(AgentAwarenessRelay, make);
