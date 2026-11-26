import { IsoDateTime, ServerProviderUsageWindow } from "@t3tools/contracts";
import { makeUsageLimits } from "@t3tools/provider-core/server/usageLimits";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export const antigravityQuotaFilename = "statusline-quota.json";
export const maxStatusLineBytes = 1024 * 1024;

const bucketId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/));
const snapshotTime = IsoDateTime.check(
  Schema.makeFilter((value) => Option.isSome(DateTime.make(value))),
);
const statusLine = Schema.Struct({
  product: Schema.optional(Schema.Literal("antigravity")),
  quota: Schema.Record(Schema.String, Schema.Unknown),
});
const bucket = Schema.Struct({
  remaining_fraction: Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 })),
  disabled: Schema.optional(Schema.Boolean),
  reset_time: Schema.optional(Schema.NullOr(IsoDateTime)),
  reset_in_seconds: Schema.optional(Schema.NullOr(Schema.Finite)),
});
const storedQuota = Schema.Struct({
  version: Schema.Literal(1),
  checkedAt: snapshotTime,
  buckets: Schema.Array(
    Schema.Struct({
      id: bucketId,
      usedPercent: ServerProviderUsageWindow.fields.usedPercent,
      resetsAt: Schema.optional(snapshotTime),
    }),
  ),
});
const decodeStatusLine = Schema.decodeUnknownOption(Schema.fromJsonString(statusLine));
const decodeBucket = Schema.decodeUnknownOption(bucket);
const decodeStoredQuota = Schema.decodeUnknownOption(Schema.fromJsonString(storedQuota));
const encodeStoredQuota = Schema.encodeEffect(Schema.fromJsonString(storedQuota));
const sameBuckets = Schema.toEquivalence(storedQuota.fields.buckets);
const validId = Schema.is(bucketId);

export function quotaFromStatusLine(
  input: string,
  now: DateTime.Utc,
): typeof storedQuota.Type | undefined {
  const data = Option.getOrUndefined(decodeStatusLine(input));
  if (!data) return undefined;
  const buckets: Array<(typeof storedQuota.Type)["buckets"][number]> = [];
  for (const [id, value] of Object.entries(data.quota)) {
    if (!validId(id)) continue;
    const item = Option.getOrUndefined(decodeBucket(value));
    if (!item || item.disabled) continue;
    const delay = item.reset_in_seconds;
    const reset = DateTime.make(item.reset_time ?? "").pipe(
      Option.orElse(() =>
        delay != null && delay >= 0
          ? DateTime.make(DateTime.toEpochMillis(now) + delay * 1_000)
          : Option.none(),
      ),
    );
    const resetsAt = Option.getOrUndefined(Option.map(reset, DateTime.formatIso));
    buckets.push({
      id,
      usedPercent: Math.round((1 - item.remaining_fraction) * 10_000) / 100,
      ...(resetsAt ? { resetsAt } : {}),
    });
  }
  buckets.sort((a, b) => a.id.localeCompare(b.id));
  return { version: 1, checkedAt: DateTime.formatIso(now), buckets };
}

function windowKind(id: string): typeof ServerProviderUsageWindow.Type.kind {
  const parts = id.toLowerCase().split(/[._:-]/);
  if (parts.includes("weekly") || parts.includes("week")) return "weekly";
  if (parts.includes("monthly") || parts.includes("month")) return "monthly";
  if (parts.includes("session") || /(?:^|[._:-])5(?:h|[-_]?hours?)(?:$|[._:-])/i.test(id))
    return "session";
  return "other";
}

const readStored = Effect.fn("AntigravityLocalQuota.readStored")(
  function* (file: string) {
    const fs = yield* FileSystem.FileSystem;
    const info = yield* fs.lstat(file);
    if (info.type !== "File" || info.size > maxStatusLineBytes) return undefined;
    return Option.getOrUndefined(decodeStoredQuota(yield* fs.readFileString(file)));
  },
  Effect.orElseSucceed(() => undefined),
);

export const saveAntigravityQuota = Effect.fn("AntigravityLocalQuota.save")(function* (
  file: string,
  quota: typeof storedQuota.Type,
) {
  const previous = yield* readStored(file);
  // The CLI emits the whole status line again for unrelated terminal activity.
  if (
    previous &&
    (sameBuckets(previous.buckets, quota.buckets) ||
      Date.parse(previous.checkedAt) > Date.parse(quota.checkedAt))
  )
    return;
  if (!previous && !quota.buckets.length) return;
  const fs = yield* FileSystem.FileSystem;
  if (Option.isSome(yield* fs.readLink(file).pipe(Effect.option))) {
    return yield* new LocalQuotaStorageError({
      message: "The quota snapshot path is a symbolic link.",
    });
  }
  const contents = yield* encodeStoredQuota(quota);
  if (contents.length > maxStatusLineBytes) {
    return yield* new LocalQuotaStorageError({
      message: "The quota snapshot exceeds the size limit.",
    });
  }
  yield* writeFileStringAtomically({ filePath: file, contents });
});

class LocalQuotaStorageError extends Schema.TaggedError<LocalQuotaStorageError>()(
  "LocalQuotaStorageError",
  {
    message: Schema.String,
  },
) {}

export const readAntigravityQuota = Effect.fn("AntigravityLocalQuota.read")(function* (
  file: string,
) {
  const quota = yield* readStored(file);
  if (!quota) return undefined;
  const now = DateTime.toEpochMillis(yield* DateTime.now);
  const windows = quota.buckets
    .filter((item) => !item.resetsAt || Date.parse(item.resetsAt) > now)
    .map((item) => ({ ...item, label: item.id, kind: windowKind(item.id) }));
  return windows.length ? makeUsageLimits({ checkedAt: quota.checkedAt, windows }) : undefined;
});
