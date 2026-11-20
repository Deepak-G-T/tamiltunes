# In-app updates (Android app): Profile > Check for updates

The app reads `version.json` from the newest GitHub Release of **Deepak-G-T/tamiltunes** (the repository must stay public: the app contains no token),
downloads `app-release.apk` from the same release, checks its SHA-256, and opens Android's installer. Website and PWA never show any of this.

## How it works
- `frontend/src/lib/appUpdate.js`: pure rules (versionCode compare, URL allow-list, version.json validation, 12 h rule, messages). Tests: `appUpdate.test.js`.
- `frontend/android/app/src/main/java/com/tamiltunes/app/AppUpdaterPlugin.java`: our own plugin (no extra npm package). It is the ONLY native code that downloads
  or writes a file. Start address must be `https://github.com/Deepak-G-T/tamiltunes/releases/...`; every redirect hop must be https on `github.com`,
  `objects.githubusercontent.com` or `release-assets.githubusercontent.com`. The file goes to the app's private cache folder `updates/`, is hashed while it downloads,
  and is deleted on a wrong hash, on Later, on failure and at every app start. A test keeps the Java host list and `appUpdate.js` in step and scans the Java file.
- `frontend/src/lib/updater.js` (plugin calls), `updateState.js` (last check, newest version), `components/native/{AppUpdateCard,UpdateSheet,UpdateChecker}.jsx`.
- Profile (your own): "Version x.y.z", **Check for updates**, "Last checked ...". Newer version: sheet with the changelog, **Update now** / **Later**, a progress bar,
  then Android's installer. First time Android asks "Allow from this source" for TamilTunes: the app opens that settings page and says so. A small dot on the Profile tab
  when an update is known. Quiet check: at most every 12 hours, once per app start, never while music plays, errors ignored.
- Android needs `REQUEST_INSTALL_PACKAGES` (declared) and the FileProvider (`res/xml/file_paths.xml`, cache path).

## Honest limits
- The SHA-256 in `version.json` only catches a damaged download. `version.json` and the APK live in the same release, so it is NOT protection against someone who can
  publish releases. The real protection is Android: it refuses to install an update that is not signed with the same key as the installed app.
- Debug builds (the `Android debug APK` workflow) are signed with a throw-away key that differs between CI runs. A release APK can never update a debug APK:
  uninstall the debug one once (you log in again), install the first release, and every later release updates in place and keeps your login and data.
- If the release keystore is lost, nobody can update: everyone must uninstall and reinstall. Back it up (see below).
- UNTESTED on a real phone: everything (install v1, publish v2, tap the button, download, installer prompt, login and data kept after the update).

## One-time setup: the release keystore (on your own computer)
1. Create ONE keystore (keep the passwords in a password manager; use long random ones):
   ```
   keytool -genkeypair -v -keystore tamiltunes-release.jks -alias tamiltunes -keyalg RSA -keysize 2048 -validity 10000
   ```
   It asks for a keystore password, a key password and some name fields. The file `tamiltunes-release.jks` is git-ignored: never commit it.
2. **Back it up now**: copy `tamiltunes-release.jks` to two places you control (for example an encrypted USB stick and a password manager's file storage) and write down the alias (`tamiltunes`) and both passwords.
3. Turn it into text for GitHub (PowerShell). This copies the text to the clipboard:
   ```
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("tamiltunes-release.jks")) | Set-Clipboard
   ```
4. GitHub > the repository > Settings > Secrets and variables > Actions > New repository secret. Create four secrets (paste the values in the GitHub page, never in chat or in a file in the repo):
   - `KEYSTORE_BASE64` : the clipboard text from step 3
   - `KEYSTORE_PASSWORD` : the keystore password
   - `KEY_ALIAS` : `tamiltunes`
   - `KEY_PASSWORD` : the key password
5. (Optional, to build a release APK on your own computer) create `frontend/android/keystore.properties` (git-ignored) with `storeFile=C:/path/tamiltunes-release.jks`, `storePassword=...`, `keyAlias=tamiltunes`, `keyPassword=...`.

## Releasing a version

The Install page's Download APK button points to releases/latest/download/app-release.apk, so it works once the first non-pre-release exists.

1. Make sure `master` has what you want to ship and its checks are green.
2. Tag and push the tag (the tag decides the version; it must be `vX.Y.Z`, minor and patch up to 99):
   ```
   git checkout master && git pull --ff-only origin master
   git tag v1.0.1
   git push origin v1.0.1
   ```
   versionCode = major*10000 + minor*100 + patch (v1.0.1 = 10001, v1.2.3 = 10203): it always grows with the version and is higher than every debug build number.
3. GitHub Actions > "Android release APK" builds the signed APK, checks the signature, and creates the Release `TamilTunes 1.0.1` with `app-release.apk` and `version.json`
   (versionName, versionCode, sha256, size and a changelog made from the commit titles since the previous tag).
4. Open the Releases page and check both files are there. Phones pick it up the next time they check.
5. Missing a secret fails the build with a clear message instead of publishing an unsigned file.
