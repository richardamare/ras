---
title: Connect Outlook through the consumers tenant with the existing app registration
status: proposed
date: 2026-11-17
---

# 2. Connect Outlook through the consumers tenant with the existing app registration

## Context

ras writes plain events through Graph into the calendars of the owner's Outlook account, which is a personal Microsoft account. Every client signs in to ras as the owner through better-auth, so no caller carries a Microsoft token that ras could exchange, and ras has to hold its own.

## Decision

The owner connects Outlook once, with `ras graph connect` or from Settings. ras sends the owner to the consumers tenant's authorize endpoint with PKCE, asking for `offline_access` and `Calendars.ReadWrite`, and Microsoft returns to `/graph/callback`. ras redeems the code with the client secret and stores the access and refresh tokens in `global_graph_tokens`, sealed with AES-GCM under a key derived from `RAS_AUTH_SECRET`. `Graph.token` hands every caller a current access token and refreshes it, one refresh at a time, when less than two minutes are left.

ras uses the Entra app registration the owner already has for personal accounts, with ras's callback added as a web redirect URI. Its client id is a Terraform variable, and its secret lives in Secret Manager as `graph-client-secret`.

## Consequences

- The owner adds `<RAS_URL>/graph/callback`, and `http://localhost:<port>/graph/callback` for development, to the registration's web redirect URIs before the first connection.
- A backup of the database carries the tokens sealed; restoring it on another host needs the same auth secret, or the owner connects again.
- Changing `RAS_AUTH_SECRET` drops the connection, and the owner connects again.
- The client secret expires on 2028-10-22, after which every refresh fails until a new secret is set.
- A refresh token Microsoft revokes makes every Graph call fail with a reason that tells the owner to connect again.
