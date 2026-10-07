# MPVKit Nettle Linker Warnings Are Harmless

**Date**: 2026-07-18
**Category**: build-ios
**Key files**: `modules/mpv-player`, MPVKit prebuilt xcframework

## Detail

Release builds emit ~50 linker warnings like `could not find symbol '_nettle_rsa_public_key_init' in object file '.../MPVKit.framework/MPVKit(rsa.o)'` (also DES, GOST, Streebog, MD5, SHA512 symbols). These come from the prebuilt MPVKit xcframework: its symbol table still references internal Nettle/GnuTLS crypto symbols whose bodies were dead-stripped when the MPVKit binary was built upstream. The symbols mpv actually uses are linked fine; playback and HTTPS streaming work. Nothing in this repo can or needs to fix it — ignore, along with the `iOS@9.0 deployment version mismatch` warnings from pod privacy-manifest bundles (Mute, RNDeviceInfo, PromisesObjC).

General rule for this repo: warnings originating inside `Pods/` or `XCFrameworkIntermediates/` are inherited third-party noise; only warnings pointing at `modules/` or app-target code deserve attention.
