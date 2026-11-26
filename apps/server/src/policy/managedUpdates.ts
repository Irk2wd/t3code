import { type ManagedPolicyDocument } from "@t3tools/contracts";
import type { CliReleaseChannel } from "@t3tools/shared/cliRelease";

/**
 * The update mirror the policy sends updates to, or `undefined` for the public releases. It wins
 * over the environment, which a user can set.
 */
export function managedUpdateMirror(document: ManagedPolicyDocument | undefined) {
  const feedUrl = document?.limits?.updates?.feedUrl;
  return feedUrl === undefined || document === undefined
    ? undefined
    : { organization: document.organization, feedUrl };
}

/** All in-app update requests are refused before feed lookup. */
export function managedUpdateRefusal(
  _document: ManagedPolicyDocument | undefined,
  _targetChannel?: CliReleaseChannel,
): string | undefined {
  return "Application updates are disabled in this build.";
}
