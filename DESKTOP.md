# StudyFlow desktop: install once, update automatically

After this setup you open StudyFlow from the Start menu like any other app. When you change the code, one command publishes a new version, and your installed copy offers to update itself.

Do the steps in order. A copy installed before step 2 can't verify updates and would need reinstalling.

## 1. Install the build tools (once per PC, ~15 minutes)

1. **Microsoft C++ Build Tools.** Download "Build Tools for Visual Studio" from Microsoft. In the installer, tick **Desktop development with C++** and install.
2. **Rust.** Download and run `rustup-init.exe` from rustup.rs and accept the defaults. Then open a new terminal and check with `rustc --version`.
3. **WebView2** is already part of Windows 10 and 11, so there's nothing to do.

Then, in the project folder:

```powershell
npm install                              # adds the new packages and updates package-lock.json
npx tauri icon src-tauri/app-icon.png    # generates src-tauri/icons/
```

## 2. Create the update signing key (once, ~5 minutes)

Every update is signed, and your installed app refuses anything not signed with this key.

```powershell
npx tauri signer generate -w "$HOME\.tauri\studyflow.key"
```

Choose a password when asked. This creates two files:

- **`studyflow.key` (private).** Back it up somewhere safe, like a password manager. Never commit it. If it's lost, installed copies can't accept updates and must be reinstalled by hand.
- **`studyflow.key.pub` (public).** Open it, copy its whole contents, and paste them into `src-tauri/tauri.conf.json`, replacing `PASTE_THE_CONTENTS_OF_studyflow.key.pub_HERE`.

## 3. Connect GitHub (once, ~5 minutes)

1. In the GitHub repo, go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `TAURI_SIGNING_PRIVATE_KEY`: the full contents of `studyflow.key`.
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: the password from step 2.
2. The repo must be **public** for installed copies to see new releases. GitHub requires a login to download release files from a private repo, and the updater doesn't have one. If you'd rather keep the code private, publish releases from a separate public repo, or host `latest.json` elsewhere and change the URL in `tauri.conf.json`.
3. Commit everything, including `package-lock.json`. The release build uses `npm ci`, which fails if the lockfile is out of date.

```powershell
git add -A
git commit -m "Desktop app with auto-update"
git push
```

## 4. Publish the first version and install it

```powershell
npm run release
```

This bumps the version (0.1.0 → 0.1.1), tags it, and pushes. GitHub then builds the installer, which takes about 10–15 minutes the first time. Watch it under the repo's **Actions** tab.

When it finishes:

1. Open the repo's **Releases** page.
2. Download `StudyFlow_0.1.1_x64-setup.exe` and run it. It installs for your user only, with no admin prompt, and adds a Start menu entry.
3. Windows will say **"Windows protected your PC"** because the app isn't code-signed with a paid certificate. Click **More info → Run anyway**. You'll only see this when installing by hand, not for automatic updates.

## 5. Move your data into the desktop app

The desktop app stores data in its own database file, separate from the browser version.

1. In `npm run dev`, go to **Settings → Backup → Save backup**.
2. In the installed app, go to **Settings → Backup → Restore from backup** and pick that file.

## Day to day

- **Using StudyFlow:** open it from the Start menu. Opening it again while it's running just brings the existing window forward. It remembers its window size and position.
- **Working on the code:** use `npm run dev` as before. It's the fastest way to see changes.
- **Shipping a change to your installed app:** commit, then run `npm run release`. For a bigger version jump, use `npm run release:minor`. About 10 minutes later, the app shows **"StudyFlow 0.1.2 is ready. Restart and update"**. It checks 5 seconds after launch and every 6 hours after that, and **Settings → About** has a manual check button.
- **Your data** lives in your Windows user profile, not in the install folder, so it survives every update. Back up from Settings once in a while anyway.

## Offline or quick local installer

To build an installer on your own PC without GitHub:

```powershell
npm run desktop:install
```

The first build compiles Rust from scratch, which takes 5–10 minutes. Later builds are faster. The installer lands in `src-tauri\target\release\bundle\nsis\`.

This local build skips update signing, so it works before step 2. But it also can't sign updates, so for everyday use install from a GitHub release instead.

## If something goes wrong

- **Release build fails at "Check the tag matches package.json":** the tag was made by hand. Delete it and use `npm run release`.
- **Release build fails at `npm ci`:** `package-lock.json` wasn't committed after `npm install`.
- **Release build fails while signing:** one of the two secrets is missing or has extra spaces or line breaks around it.
- **"Couldn't check for updates" in Settings:** check that the repo is public and a published (not draft) release exists. The address in `tauri.conf.json` should open a small JSON file in your browser.
- **The app never offers updates:** the installed copy was probably built before the public key was pasted in. Reinstall from the latest GitHub release.
