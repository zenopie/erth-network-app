# assetlinks.json

Digital Asset Links. It is what lets `https://erth.network/ref/<address>` open
the Android app directly instead of Android showing a "which app?" chooser.
Referral links land on that path — see `wallet/utils/Referral.kt` in
earth-network-mobile.

## This file is INCOMPLETE until the Play fingerprint is added

The one fingerprint here is the **upload** key
(`earth-wallet-upload.keystore`). Under Play App Signing, that is not the key
users' apps are signed with — Google re-signs with its own, and Android
verifies against *that*. So installs from the Play Store will NOT auto-verify
on this file alone.

Add the app signing certificate's SHA-256 from:

    Play Console -> your app -> Test and release -> Setup -> App integrity
    -> App signing key certificate -> SHA-256 certificate fingerprint

Both belong in the array. Keeping the upload one alongside it means a locally
signed release APK verifies too, which is what makes the link testable without
going through the store.

## Checking it

    curl https://erth.network/.well-known/assetlinks.json

Must return this JSON as `application/json`. If it returns the app's HTML, the
SPA fallback swallowed it — nginx.conf has a `location /.well-known/` block to
prevent exactly that.

Android's own check, once installed:

    adb shell pm verify-app-links --re-verify network.erth.wallet
    adb shell pm get-app-links network.erth.wallet
