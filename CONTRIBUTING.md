# Contributing to Blindspot

Thanks for wanting to help. Pull requests are welcome from anyone, whether it's your first open-source contribution or your hundredth.

## Getting started

1. Fork the repository and create a branch for your change.
2. Set it up:
   ```bash
   npm install
   npm start      # run the app from source
   npm test       # encryption self-check
   ```
   To try things without touching your real locker, set the `BLINDSPOT_DIR` environment variable to an empty test folder before `npm start`.
3. Make your change, run `npm test`, and try it in the app.
4. Open a pull request. Say **what** you changed and **why**, and how you tested it. Screenshots help for anything visual.

Small, focused pull requests get reviewed fastest. For a big feature, open an issue first so we can agree on the approach before you spend time on it.

## Blindspot's promises

Every change needs to keep these. They're the reason the app exists.

- **Nothing readable on disk.** No decrypted temporary files, caches or logs.
- **Nothing on the network.** No accounts, telemetry, update checks or cloud calls.
- **Invisible to AI agents.** Don't weaken screen-capture protection, the accessibility switch or the debugging lockdown in `main.js`.
- **Never lose someone's memories.** Changes to the vault format must still open lockers made by older versions. `test.js` checks this.
- **Keep it small.** Prefer the platform and Node's standard library over new dependencies. The app should stay readable in one sitting.

## Ideas we'd love help with

- **Blur until reveal:** photos blurred by default, press and hold to see one.
- **Webcam guard (opt-in):** blank the screen when a phone or a second face appears, processed locally only.
- **Unlock with Windows Hello** (face, fingerprint or PIN) instead of a typed password.
- **Screen-reader mode (opt-in):** turn the accessibility layer back on for people who need it.
- **Thumbnails** so big lockers stay fast.
- **Change password**, rename folders, folders inside folders.
- **HEIC preview** for iPhone photos.
- **Testing** on Windows 10, on Copilot+ PCs (Copilot Vision, Click to Do), and on macOS and Linux.

## Reporting problems

- **Bugs and ideas:** open an issue.
- **Security problems:** please report privately through *Security → Report a vulnerability*, not in a public issue.
- **Corrections** to the README's research or threat model are very welcome. Just open an issue or a pull request.

By contributing, you agree that your contribution is licensed under the [Apache 2.0](LICENSE) licence.
