# KittyCat Solitaire on the Mac, through TestFlight

The Mac app is a small native shell (`apple/mac/`) around the whole game, bundled inside the app. It plays offline, has a real menu bar (New Game ⌘N, Undo ⌘Z, Settings ⌘,, Any Moves Left? ⌘M, Finish ⇧⌘F, Stats ⇧⌘S), and uses the Mac's own alerts and save and open panels for backups. GitHub builds it on a Mac in the cloud, so no Xcode is needed on your own computer.

## What happens on its own

Every push that changes the game or `apple/mac/` runs **Actions > Mac app > build** on a GitHub Mac with Xcode 26. It builds the app unsigned to prove it compiles. A green tick means the code is sound; it does not upload anything.

## One-time setup for TestFlight (about 20 minutes, all in a browser)

1. **Apple Developer Program.** The account that will publish must be enrolled (developer.apple.com/programs).
2. **Team ID.** developer.apple.com > Account > Membership details: copy the 10-character Team ID.
3. **App record.** appstoreconnect.apple.com > Apps > + > New App:
   - Platform: macOS. Name: KittyCat Solitaire. Primary language: English.
   - Bundle ID: `com.jenningsjason76.kittycat-solitaire`. If it is not in the list, register it first at developer.apple.com > Certificates, IDs & Profiles > Identifiers > + > App IDs > App, with that exact ID.
   - SKU: anything, e.g. `kittycat-mac`.
4. **API key.** App Store Connect > Users and Access > Integrations > App Store Connect API > Team Keys > +. Name it "GitHub", access **App Manager** (Admin also works). Download the `.p8` file once (Apple will not show it again), and note the **Key ID** and the **Issuer ID** at the top of the page.
5. **GitHub secrets.** github.com/jenningsjason76/kittycat-solitaire > Settings > Secrets and variables > Actions > New repository secret, four times:

   | Name | Value |
   |------|-------|
   | `APPLE_TEAM_ID` | the Team ID from step 2 |
   | `ASC_KEY_ID` | the Key ID from step 4 |
   | `ASC_ISSUER_ID` | the Issuer ID from step 4 |
   | `ASC_KEY_P8_BASE64` | the `.p8` file as base64 (below) |

   To get the base64 on a Mac: `base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy`, then paste.
6. **Upload.** GitHub > Actions > Mac app > Run workflow > tick "Upload to TestFlight" > Run. About 10 minutes. Each run gets a new build number automatically.
7. **Testers.** App Store Connect > the app > TestFlight. The build appears after Apple's processing (often 10 to 30 minutes). Add yourself and her under Internal Testing (up to 100 people on your team, no review needed). For people outside your team, use External Testing, which needs a short beta review the first time.
8. **On her Mac.** Install TestFlight from the Mac App Store, accept the invitation, Install. TestFlight on the Mac needs macOS 13 or later; the app itself needs macOS 14 or later.

## If a step fails

- **Archive fails with a signing or "no account" error.** The API key needs App Manager or Admin access. Apple's forums report that keys with less access cannot create the signing certificates.
- **Export or upload fails with "Failed to log in".** Re-check the Issuer ID, and that the base64 secret is one line with no breaks. Apple's forums disagree on whether uploads with an API key always work. If it keeps failing, tell Claude: the workflow can keep the built package as a download, and you upload it once with Apple's Transporter app.
- **The app opens but the game does not load, or games are not remembered between launches.** That would mean WebKit is not storing data for the app's built-in `kittycat://` address. This is the one part that could not be tested before the first real build. Tell Claude what you see.

## App Review notes (for a public release later)

- Apple's rule 4.2 rejects apps that are only a website in a frame. This app does not load a website: the game is inside the app, works with no network, and uses the Mac's menus, keyboard shortcuts and file panels.
- Since April 28, 2026, uploads must be built with Xcode 26 or later. The workflow selects the newest Xcode 26 on the runner.
- `ITSAppUsesNonExemptEncryption` is NO, so TestFlight does not ask the export-compliance question on every build.

## Building on your own Mac instead (optional)

```
brew install xcodegen
sh apple/mac/scripts/bundle-web.sh
cd apple/mac && xcodegen generate && open KittyCat.xcodeproj
```
Choose your team under Signing & Capabilities, then Product > Archive > Distribute App > App Store Connect.
