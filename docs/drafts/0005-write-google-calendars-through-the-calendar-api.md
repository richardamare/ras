---
title: Write the connected Google account's calendars through the Calendar API
status: proposed
date: 2026-11-25
---

# 5. Write the connected Google account's calendars through the Calendar API

## Context

The owner moved their personal calendars from Outlook to a Google account and made it Reclaim's main calendar. ras writes plain events and work blocks only through Graph, so the Google calendars are read-only and a space pointed at one cannot keep its work blocks. Reclaim's API still cannot create a plain event.

## Decision

ras connects one Google account the way it connects Outlook. Both run one authorization code flow with PKCE in `global/oauth`. The owner signs in from Settings or with `ras google connect`. ras asks for `calendar.events` with offline access and stores the tokens sealed in `global_google_tokens`.

A calendar is writable when the email of its Reclaim credential matches the Outlook or the Google account connected to ras. Its events are written by that account's writer. Each writer turns one provider-neutral write into its own body: Graph's, or the Calendar API's with an RRULE for a repeat. The Calendar API addresses an event by Reclaim's id of it, which is Google's own, an occurrence's included. A create sends its key as the event id, so a retried create writes the event once.

## Consequences

- The owner creates a Google Cloud OAuth client of the web application type, with `<RAS_URL>/google/callback` as a redirect URI and the Calendar API enabled. Its id and secret go in `RAS_GOOGLE_CLIENT_ID` and `RAS_GOOGLE_CLIENT_SECRET`.
- The OAuth consent screen has to be in production, not testing, or Google expires the refresh token after seven days and the owner connects again every week.
- Google tells only busy from free, so an event shown as tentative, out of office or working elsewhere is written busy.
- A work block placed before its space moved to a Google calendar stays in the Outlook calendar, and ras keeps moving it there.
- Changing `RAS_AUTH_SECRET` drops both connections, as it does Outlook's alone today.
