# App link files

`erth.network/ref/<handle>` opens Earth Wallet directly when it is installed;
otherwise `src/pages/Referral.jsx` shows the handle to type in at registration.

- `public/.well-known/assetlinks.json` — Android App Links for `network.erth.wallet`.
  Two fingerprints: the upload key (`earth-wallet-upload.keystore`, so locally
  signed release APKs verify) and the Play app signing key (Play Console ->
  Setup -> App integrity), which is what store installs are signed with.
- `public/.well-known/apple-app-site-association` — iOS universal links for
  `XD8VH8WKVX.network.erth.EarthWallet`, paths `/ref/*`. The App ID needs the
  Associated Domains capability, and the app's entitlement `applinks:erth.network`.

Both must be served as `application/json` (no redirect) — `nginx.conf` has a
`location /.well-known/` block ahead of the SPA fallback for that.

    curl -i https://erth.network/.well-known/assetlinks.json
    curl -i https://erth.network/.well-known/apple-app-site-association
    adb shell pm verify-app-links --re-verify network.erth.wallet
