# Remote access for the privacy fork

Run this fork on each device that hosts sessions. Its desktop and web interfaces use a local server by default. Official T3 Connect, cloud account linking and notification delivery are disabled.

<a id="approve-new-devices"></a>
<a id="more-machines-with-t3-chat"></a>

Cloud device registration and paid account linking are unavailable in this fork. Pair directly with a host you control.

## Desktop-managed SSH

1. Build this fork on the target machine and install the model CLIs you intend to use there. The remote login shell needs the Node version listed in the root package manifest.
2. On the desktop machine, set `T3CODE_DEV_REMOTE_T3_SERVER_ENTRY_PATH` to the absolute path of the remote checkout's built `apps/server/dist/bin.mjs` before launching T3.
3. In **Settings → Environments → Add environment → SSH**, enter the host or SSH alias you want. T3 uses SSH to launch the configured server and forward a local port. The remote host receives the authentication and project traffic you send to that environment.

The SSH launcher requires the configured remote entry point. Software installation and updates on the target machine are manual.

## Reach one machine several ways

Use the SSH tunnel from your desktop or serve the web interface from a host you control.

## Browser and mobile clients

Open the web interface served by your own host. The web client uses its serving origin for application requests. For an explicitly selected remote HTTPS backend, desktop and mobile clients use exact trusted origins. Set `T3CODE_ALLOWED_ORIGINS` before starting the desktop app, or `EXPO_PUBLIC_T3CODE_ALLOWED_ORIGINS` when building the mobile client. Configure the host for direct access and pair using a link it generates. [Network destinations and data sent](./telemetry.md)

## Browser on a remote environment

Browser tabs belong to the host environment so you and your agents share them from any device.

- **Streaming & local loading**: Web and mobile stream tabs from the host. In the desktop app, tabs you open for a remote environment load locally while routing `localhost` requests to the host over the **preview tunnel** (so element picker and annotations work locally).
- **Port forwarding (desktop)**: Forward any remote host port to your local `localhost` via the thread's **Servers** list or **Forwarded ports** in the command palette (`Cmd/Ctrl-click` forwards and opens in your browser).
- **Open on this device (mobile)**: Tap **Open on this device** on a streamed `localhost` tab or long-press a `localhost` link in chat for native touch scrolling.
- **Disable preview tunnel**: Turn off **Settings → Sharing & access → Preview tunnel** on the host (or via [managed policy](./managed-policy.md#other-capabilities)) to disable port forwarding and **Open on this device** (streamed tabs continue working).
- **Take control**: Click **Take control** before typing into an agent's tab, and release control when done.
- **Local servers**: T3 Code lists listening ports from your terminals and agents as `http://localhost:<port>` (set a script's **Preview URL** for HTTPS or subpaths). Disable discovery with `T3CODE_PORT_DISCOVERY=0`.

### Browser host setup

Server previews use a headless Chromium executable installed on the host. This fork restricts its network destinations. The pinned browser download host is `https://storage.googleapis.com` and requires explicit approval through `T3CODE_ALLOWED_ORIGINS` for automatic installation. [Destination settings](./telemetry.md)

## Link another environment

Allow the destination HTTPS origin on the source first. Link two T3 Code machines (beta) so agents on one can launch, message, delegate to, and manage threads on the other.

1. Enable **Settings → Labs → Linked environments** on **both** machines (or `"linkedEnvironmentsEnabled": true` in `userdata/settings.json`).
2. On the source machine, open **Settings → Environments → Linked environments → Link** (or drag from one machine's `+` to another on the Environments map, or run `t3 environment link <address> --pairing-code <code> --access <mode>`). Use **Link several…** or `--from <file>` for batch linking.
3. Links are one-way (tick **Also link … back** for two-way) and do not chain. Links expire after 30 days of inactivity and can be revoked in **Settings → Sharing & access** or **Forget**.

- **Access boundary**: Agents never get more permissions on the target than the link's access level or their own thread mode. Below Full access, linked agents can only modify threads they started and skip project setup scripts.
- **Delegation**: Agents can target a linked machine with `delegate_task`, or ask you to link an unlinked machine via an in-thread approval card.

### Read a linked machine's threads

Open a delegated task or thread link on a linked machine to follow it live (read-only) in the right panel without pairing your client directly. Click **Connect to interact** to pair and take action (one-click if the link has Full access and you can manage access). Files, images, and HTML renders stay on the remote machine until you connect directly.
