# @opendocs/ads

The optional ads add-on: ad pixels in the browser and conversion events from
the server. **This package is a placeholder that does nothing.** It defines
the functions the web app and API call, so the code builds and runs without
any ad tracking.

opendocs.cc's production build swaps in a private package with the same name,
`package.json` and exports. The Dockerfiles copy the package from the
directory named by the `ADS_DIR` build argument (default `packages/ads`, this
placeholder; production uses `addons/ads`, which is gitignored), and the web
build sources an optional `build.env` file in it for build-time settings.

The web app and API call the add-on only after the visitor's consent allows
ads (`apps/web/lib/ad-tracking/consent.ts`), and never on workspaces' custom
domains. With `NEXT_PUBLIC_AD_PIXELS_ENABLED` unset, nothing ads-related
runs, and the cookie banner doesn't show.

A replacement must keep `package.json` identical to this one (same name,
version and no dependencies), so `package-lock.json` stays valid.
