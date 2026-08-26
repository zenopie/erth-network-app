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
`image:` line here with the digest it pushed and commits that back to main.

**A tag publishes an image. It does not change what is served.** Nothing tells
Akash to pick the new digest up, so the lease keeps running whatever it was
already running until the deploy below is run by hand. v0.3.1 through v0.3.3
each shipped this way and each needed that step.

    git tag v0.3.4 && git push origin v0.3.4
    gh run watch                 # let CI build and pin
    git pull origin main         # picks up the pinned digest
    deploy/akash/deploy.sh       # and this is what actually deploys it

## Deploy

`deploy.sh` updates the lease in place, from whatever digest `deploy.yaml` is
pinned to. In place keeps the lease and its tunnel; only image and env changes
can go this way, because endpoint kinds and resources are part of what the
provider bid on. Changing those needs a close-and-recreate, which means a new
lease and reattaching the tunnel.

    deploy/akash/deploy.sh           deploy the committed digest
    deploy/akash/deploy.sh --print   build the SDL and read it, send nothing

    PUT /v1/deployments/{dseq}   {"data": {"sdl": "<sdl>"}}

TUNNEL_TOKEN is NOT in the SDL. It is injected into the submitted copy from the
gitignored `.env` at the repo root — it still reaches the provider, as
everything in a submitted SDL does, but not a public repository.

The dseq is in the script rather than discovered. One API key reaches this
deployment, the chain's and the backend's, and the API does not say which is
which — they are told apart only by their service names, so a script picking a
target at runtime is a script that can deploy the web app over the chain. It
refuses to submit an SDL without `web`/`cloudflared`, and refuses if the
`env: []` it splices the token into is not there exactly once.

Creating a deployment from scratch, which is a different thing and not what
`deploy.sh` does:

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
