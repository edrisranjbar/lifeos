# Email inbox and daily summary

Connect a mailbox in **Settings → Email** to see your recent email on the Overview, plus a short AI summary of the last 24 hours each morning.

## What it does

- **Recent email:** the newest 30 messages in your inbox (12 shown), with unread ones marked. Gmail messages open in Gmail when you click them. The list is cached for ten minutes; the refresh button checks again.
- **Morning summary:** the first time you open the Overview each day, LifeOS reads the email that arrived in the last 24 hours and asks the AI model you chose to sort it into *Needs your reply*, *Deadlines and bills*, *Worth knowing* and *Can skip*. The summary is kept for the rest of the day; the refresh button writes a new one (at most once every two minutes).

LifeOS only **reads** your inbox. It opens it read-only, so it never sends, deletes, moves or marks mail as read.

## Connecting a mailbox

LifeOS uses IMAP over TLS (port 993) with an **app password**, so it works with Gmail, Outlook, Yahoo, iCloud, Fastmail and most other providers.

| Provider | IMAP server | App password |
|---|---|---|
| Gmail | `imap.gmail.com` | Turn on 2-Step Verification, then create one at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). |
| Outlook / Hotmail | `outlook.office365.com` | Account security → App passwords (needs two-step verification). |
| Yahoo | `imap.mail.yahoo.com` | Account security → Generate app password. |
| iCloud | `imap.mail.me.com` | appleid.apple.com → App-specific passwords. |

LifeOS signs in before saving, so a wrong server or password is reported straight away.

## Choosing an AI model

Pick a provider and enter your own API key, then use **Load models** to choose from the provider's current list (or type a model ID).

| Provider | Key from | Notes |
|---|---|---|
| Anthropic (Claude) | console.anthropic.com | |
| OpenAI | platform.openai.com | |
| Google Gemini | aistudio.google.com | |
| OpenAI-compatible | your provider | Any `/chat/completions` API, for example OpenRouter or Groq (`https://…/v1`), or a local Ollama server (`http://localhost:11434/v1`, no key). Only `https://` addresses are accepted, except a server on the same machine. |

Without a provider, the inbox still shows on the Overview; only the summary is off.

## Privacy

- The app password and API key are encrypted (AES-256-GCM) before they are stored, are never sent back to the browser, and are deleted when you click **Disconnect**.
- To write the summary, the sender, subject and the first part of each message from the last 24 hours (up to 60 messages) are sent to the AI provider you chose, under your key. Email text is treated as data: the model is told not to follow instructions inside emails, and its summary is only displayed.
- The recent-email list and today's summary are stored in this server's database, per account.

## Running it on a schedule (optional)

The summary is written on your first visit of the day. To have it ready in advance, run the script from cron:

```
0 7 * * * php /path/to/lifeos/tools/mail-digest.php
```

## For operators

- Secrets are encrypted with `LIFEOS_SECRET_KEY` (or `secret_key` in `config.php`). If that is empty, a key is generated on first use and stored in the private files folder beside the attachments (`.lifeos-files-…/.secret-key`, outside the web root; in Docker it is on the attachments volume). Back it up with the attachments: if the key is lost or changed, people re-enter their app password and API key in Settings.
- The server makes outbound connections to the mail server on port 993 and to the chosen AI provider over HTTPS. A daily summary can take up to a couple of minutes on slow models.
