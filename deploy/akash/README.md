# Akash deployment — earth web app

    web           nginx serving the built bundle -> :80
    cloudflared   Cloudflare Tunnel connector

Nothing is published on a provider port. The site is reachable only through the
tunnel, so there is no address to update when Akash reassigns external ports on
a new lease — which is the whole reason for the connector.

One port is published and it is not the app: cloudflared's metrics on 2000.
Akash rejects a manifest with `zero global services`, so something must be, and
publishing the connector keeps the app private while giving `/ready` as a health
check. Read its external port from the lease status:

    curl http://<provider>:<port>/ready

## Release

CI builds and pushes on `v[0-9]+.[0-9]+.[0-9]+` tags only, then rewrites the
`image:` line here with the digest it pushed and commits that back to master.

    git tag v0.2.0 && git push origin v0.2.0
    git pull origin master     # picks up the pinned digest

## Deploy

TUNNEL_TOKEN is NOT in the SDL. It is injected into the submitted copy from the
gitignored `.env` at the repo root — it still reaches the provider, as
everything in a submitted SDL does, but not a public repository.

    POST /v1/deployments   {"data": {"sdl": "<sdl>", "deposit": 5}}
    GET  /v1/bids/{dseq}
    POST /v1/leases        {"manifest": ..., "leases": [...]}   # top level, not under data

Auth is `x-api-key` (Console API, managed wallet).

## Tunnel

One tunnel per deployment — replicas are chosen by proximity with no traffic
steering, so connectors able to reach different origins would black-hole
requests. Configure the Public Hostname on Cloudflare's side:

    app.erth.network -> http://web:80

The chain and the ads-for-gas backend each have their own tunnel and their own
lease.
