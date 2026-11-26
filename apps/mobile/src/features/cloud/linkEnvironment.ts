import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class CloudEnvironmentLinkError extends Schema.TaggedError<CloudEnvironmentLinkError>()(
  "CloudEnvironmentLinkError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
    traceId: Schema.optional(Schema.String),
    relayLinkCommitted: Schema.optionalKey(Schema.Literal(true)),
  },
) {}

export const updateLinkedEnvironmentLiveActivityPreference = Effect.fn(
  "linkEnvironment.updateLinkedEnvironmentLiveActivityPreference",
)((_enabled: boolean) => Effect.succeed("disconnected" as const));

export const linkEnvironmentToCloudWithPreference = Effect.fn(
  "linkEnvironment.linkEnvironmentToCloudWithPreference",
)((_input: { readonly clerkToken: string; readonly liveActivitiesEnabled: boolean }) =>
  Effect.fail(new CloudEnvironmentLinkError({ message: "T3 Connect is disabled in this build." })),
);
