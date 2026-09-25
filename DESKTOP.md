# StudyFlow desktop: install once, update automatically

After this setup you open StudyFlow from the Start menu like any other app. When you change the code, one command publishes a new version, and every installed copy offers to update itself.

The repo is public, so anyone can see the code and download the installer from the Releases page. Each person's courses and assessments stay on their own computer and are never uploaded.

Do the steps in order. A copy installed before step 2 can't verify updates and would need reinstalling.

## Before you start: where to run commands

Run every command in the project folder, the one that contains both `package.json` and `src-tauri`. If you extracted a zip with Windows Explorer, that's the **inner** `studyflow` folder. Check with:

```powershell
Test-Path .\src-tauri\tauri.conf.json    # must print True
```

## 1. Install the build tools (once per PC, ~15 minutes)

1. **Microsoft C++ Build Tools.** Download "Build Tools for Visual Studio" from Microsoft. In the installer, tick **Desktop development with C++** and install.
2. **Rust.** Download and run `rustup-init.exe` from rustup.rs and accept the defaults.
3. **Open a new terminal** so it picks up both, then check with `rustc --version`.

WebView2 is already part of Windows 10 and 11, so there's nothing to install for it.

Then, in the project folder:

```powershell
npm install                              # adds the new packages and updates package-lock.json
npx tauri icon src-tauri/app-icon.png    # generates src-tauri/icons/
```

## 2. Create the update signing key (once, ~5 minutes)

Every update is signed, and your installed app refuses anything not signed with this key. That's what stops anyone else from pushing a fake update to your users, which matters more now that the repo is public.

```powershell
npx tauri signer generate -w "$HOME\.tauri\studyflow.key"
```

Choose a password when asked. This creates two files, outside the project folder so they can't be committed by accident:

- **`studyflow.key` (private).** Back it up somewhere safe, like a password manager. Never commit it, paste it anywhere public, or share it. If it's lost, installed copies can't accept updates and must be reinstalled by hand.
- **`studyflow.key.pub` (public).** It's safe to publish. Open it, copy its whole contents, and paste them into `src-tauri/tauri.conf.json`, replacing `PASTE_THE_CONTENTS_OF_studyflow.key.pub_HERE`.

## 3. Connect GitHub (once, ~10 minutes)

### 3a. Give Git permission to push workflow files

The project includes two GitHub Actions workflows in `.github/workflows/`. GitHub only accepts changes to them from a login with the **`workflow`** permission. Without it, `git push` fails with *"refusing to allow an OAuth App to create or update workflow … without `workflow` scope"*. Set this up once, using either option.

**Option A: Personal Access Token**

1. On GitHub: profile picture → **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**.
2. Name it "StudyFlow push", choose an expiration, tick **`repo`** and **`workflow`**, then generate it and copy it. It's shown only once.
3. Open the Start menu → **Credential Manager → Windows Credentials**, find **`git:https://github.com`**, and click **Remove**.
4. Run `git push` in PowerShell. When asked to sign in, choose the **token** option and paste the token. If it asks for a username and password instead, the password is the token.

**Option B: GitHub CLI** (from cli.github.com)

```powershell
gh auth login --scopes workflow
gh auth setup-git
```

Push from a PowerShell terminal rather than Cursor's Source Control panel. The editor's built-in GitHub login doesn't have the `workflow` permission.

### 3b. Add the signing key to GitHub

In the repo: **Settings → Secrets and variables → Actions → New repository secret**. Add two secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: the full contents of `studyflow.key`.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password from step 2.

Secrets stay hidden even in a public repo. They're only handed to the release workflow while it builds.

### 3c. Push the project

Commit everything, including `package-lock.json`. The release build uses `npm ci`, which fails if the lockfile is out of date.

```powershell
git add -A
git commit -m "Desktop app with auto-update"
git push
```

Open the repo's **Actions** tab. The **CI** workflow should run and pass, confirming everything type-checks and the tests pass on GitHub's machines.

## 4. Publish the first version and install it

```powershell
npm run release
```

This bumps the version (0.1.0 → 0.1.1), tags it, and pushes. GitHub then builds the installer, which takes about 10–15 minutes the first time. Watch it under **Actions → Release**.

When it finishes:

1. Open the repo's **Releases** page.
2. Download `StudyFlow_0.1.1_x64-setup.exe` and run it. It installs for your user only, with no admin prompt, and adds a Start menu entry.
3. Windows will say **"Windows protected your PC"** because the app isn't code-signed with a paid certificate. Click **More info → Run anyway**. You'll only see this when installing by hand, not for automatic updates.

To share StudyFlow with someone, send them the Releases page link. Once they've installed it, they get updates automatically, just like you.

## 5. Move your data into the desktop app

The desktop app stores data in its own database file, separate from the browser version.

1. In `npm run dev`, go to **Settings → Backup → Save backup**.
2. In the installed app, go to **Settings → Backup → Restore from backup** and pick that file.

## Day to day

- **Using StudyFlow:** open it from the Start menu. Opening it again while it's running just brings the existing window forward. It remembers its window size and position.
- **Working on the code:** use `npm run dev` as before. It's the fastest way to see changes.
- **Shipping a change:** commit, then run `npm run release`. For a bigger version jump, use `npm run release:minor`. About 10 minutes later, every installed copy shows **"StudyFlow 0.1.2 is ready. Restart and update"**. It checks 5 seconds after launch and every 6 hours after that, and **Settings → About** has a manual check button.
- **Your data** lives in your Windows user profile, not in the install folder, so it survives every update. Back up from Settings once in a while anyway.

## Offline or quick local installer

To build an installer on your own PC without GitHub:

```powershell
npm run desktop:install
```

The first build compiles Rust from scratch, which takes 5–10 minutes. Later builds are faster. The installer lands in `src-tauri\target\release\bundle\nsis\`.

This local build skips update signing, so it works without the key. But a copy installed this way can't receive automatic updates, so for everyday use install from a GitHub release instead.

## If something goes wrong

- **"Couldn't recognize the current folder as a Tauri project":** you're not in the folder with `src-tauri`. See "Before you start".
- **Push rejected with "refusing to allow an OAuth App to create or update workflow":** Git's login lacks the `workflow` permission. See step 3a. Nothing was uploaded, so just push again after fixing it.
- **"icon.ico not found":** run `npx tauri icon src-tauri/app-icon.png`.
- **`cargo` not found, or `link.exe` errors:** Rust or the C++ Build Tools aren't installed, or the terminal was opened before installing them.
- **Release build fails at "Check the tag matches package.json":** the tag was made by hand. Delete it and use `npm run release`.
- **Release build fails at `npm ci`:** `package-lock.json` wasn't committed after `npm install`.
- **Release build fails while signing:** one of the two secrets is missing or has extra spaces or line breaks around it.
- **`npm run release` says "Git working directory not clean":** commit your changes first.
- **"Couldn't check for updates" in Settings:** check that a published (not draft) release exists. This address should open a small JSON file in your browser: `https://github.com/Hashir-azeem/StudyFlow/releases/latest/download/latest.json`
- **The app never offers updates:** the installed copy was probably built before the public key was pasted in, or with `npm run desktop:install`. Reinstall from the latest GitHub release.
