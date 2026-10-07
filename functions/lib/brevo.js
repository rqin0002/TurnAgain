import { Buffer } from 'node:buffer'

/**
 * Brevo's transactional email API (spec 5.5, facts F2.1-F2.2) over the global fetch. `sendMail`
 * never throws for a provider outcome: a 2xx is `accepted` (the provider took the request, not
 * "delivered"), a 4xx is `failed` with Brevo's own code and message (never the email body), and a
 * 5xx, a timeout (BREVO_TIMEOUT_MS) or a network error is `unknown`, because the provider may or
 * may not have accepted the request. Base64 lives here, not in functions/shared, so the SPA bundle
 * never needs Buffer (critique C2.3).
 */

export const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
export const BREVO_TIMEOUT_MS = 10_000

const MESSAGE_LIMIT = 500
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/u

/** An attachment as Brevo takes it: the UTF-8 text in base64. */
export const toBrevoAttachment = ({ name, text }) => ({
  name,
  content: Buffer.from(text, 'utf8').toString('base64'),
})

/** What the send record keeps about an attachment: its name and size, never its content. */
export const attachmentMeta = ({ name, text }) => ({ name, bytes: Buffer.byteLength(text, 'utf8') })

/**
 * The request body. `to` (one message) or `messageVersions` (one version per participant, so no
 * participant sees another address); empty optional parts are left out. The dry run builds the
 * same body and stops before fetch (facts F2.6).
 */
export function buildBrevoPayload({
  from,
  to,
  messageVersions,
  subject,
  textContent,
  htmlContent,
  attachment,
  tags,
}) {
  return {
    sender: { name: 'TurnAgain', email: from },
    subject,
    textContent,
    htmlContent,
    ...(to ? { to } : {}),
    ...(messageVersions ? { messageVersions } : {}),
    ...(attachment?.length ? { attachment } : {}),
    ...(tags?.length ? { tags } : {}),
  }
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const boundedText = (value, fallback) =>
  typeof value === 'string' && value !== '' ? value.slice(0, MESSAGE_LIMIT) : fallback

/**
 * A safe name for why fetch failed: the cause's code (ENOTFOUND), the error's own code, or the
 * exception name. Never the message, which can echo the request.
 */
const causeOf = (error) =>
  [error?.cause?.code, error?.code, error?.name].find(
    (name) => typeof name === 'string' && SAFE_NAME.test(name),
  ) ?? 'Error'

/** POSTs one email to Brevo and maps the answer to `accepted | failed | unknown`. */
export async function sendMail({ apiKey, from, ...message }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BREVO_TIMEOUT_MS)
  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(buildBrevoPayload({ from, ...message })),
      signal: controller.signal,
    })
    const body = await readJson(response)
    const { status } = response
    if (status >= 200 && status < 300) {
      const providerMessageId = body?.messageId ?? body?.messageIds?.[0] ?? null
      return { outcome: 'accepted', providerMessageId, error: null }
    }
    if (status >= 400 && status < 500) {
      return {
        outcome: 'failed',
        providerMessageId: null,
        error: {
          code: boundedText(body?.code, `http-${status}`),
          message: boundedText(
            body?.message,
            `The email provider refused the request (HTTP ${status}).`,
          ),
        },
      }
    }
    return {
      outcome: 'unknown',
      providerMessageId: null,
      error: {
        code: `http-${status}`,
        message: `The email provider answered HTTP ${status}; the email may or may not have been sent.`,
      },
    }
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        outcome: 'unknown',
        providerMessageId: null,
        error: {
          code: 'timeout',
          message: `The email provider did not answer within ${BREVO_TIMEOUT_MS / 1000} seconds.`,
        },
      }
    }
    return {
      outcome: 'unknown',
      providerMessageId: null,
      error: {
        code: 'network',
        message: 'The email provider could not be reached.',
        cause: causeOf(error),
      },
    }
  } finally {
    clearTimeout(timer)
  }
}
