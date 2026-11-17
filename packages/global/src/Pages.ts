import * as HttpServerResponse from "effect/http/HttpServerResponse"

const signedQuery = `
const signedQuery = () => {
  const params = new URLSearchParams(location.search)
  const names = new Set(params.getAll("ba_param"))
  if (!params.has("sig") || names.size === 0) return undefined
  const signed = new URLSearchParams()
  for (const [key, value] of params) if (key === "sig" || key === "ba_param" || names.has(key)) signed.append(key, value)
  return signed.toString()
}
const post = async (path, body) => {
  const response = await fetch("/auth" + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, oauth_query: signedQuery() })
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message ?? "ras refused the request (" + response.status + ").")
  return data
}
const fail = (error) => { document.getElementById("error").textContent = error.message }
`

const page = (title: string, body: string, script: string) =>
  HttpServerResponse.html(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · ras</title>
<style>
body { font: 16px/1.5 system-ui, sans-serif; max-width: 24rem; margin: 12vh auto; padding: 0 1rem; }
form, .actions { display: grid; gap: .75rem; }
input, button { font: inherit; padding: .5rem .75rem; }
#error { color: #b00020; min-height: 1.5em; }
</style>
</head>
<body>
<h1>${title}</h1>
${body}
<p id="error" role="alert"></p>
<script type="module">${signedQuery}${script}</script>
</body>
</html>`)

export const signIn = page(
  "Sign in to ras",
  `<form id="form">
<label>Email <input name="email" type="email" autocomplete="username" required></label>
<label>Password <input name="password" type="password" autocomplete="current-password" required></label>
<button>Sign in</button>
</form>`,
  `
document.getElementById("form").addEventListener("submit", async (event) => {
  event.preventDefault()
  const form = new FormData(event.target)
  try {
    const data = await post("/sign-in/email", { email: form.get("email"), password: form.get("password") })
    location.assign(data.url ?? "/")
  } catch (error) { fail(error) }
})`
)

export const consent = page(
  "Connect an app",
  `<p><strong id="client">An app</strong> asks to act as you in ras: read and change your calendar, tasks, memory and mail.</p>
<div class="actions"><button id="allow">Allow</button><button id="deny">Deny</button></div>`,
  `
const clientId = new URLSearchParams(location.search).get("client_id")
fetch("/auth/oauth2/public-client?client_id=" + encodeURIComponent(clientId ?? ""))
  .then((response) => response.json())
  .then((client) => { document.getElementById("client").textContent = client.client_name ?? client.client_id })
  .catch(() => {})
const answer = (accept) => async () => {
  try { location.assign((await post("/oauth2/consent", { accept })).url) } catch (error) { fail(error) }
}
document.getElementById("allow").addEventListener("click", answer(true))
document.getElementById("deny").addEventListener("click", answer(false))`
)

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

/** A page that only tells the owner what happened, such as the end of connecting Outlook. */
export const notice = (title: string, text: string, status = 200) =>
  HttpServerResponse.setStatus(page(escape(title), `<p>${escape(text)}</p>`, ""), status)
