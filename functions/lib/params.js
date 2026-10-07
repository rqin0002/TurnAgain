import { defineSecret, defineString } from 'firebase-functions/params'

/** Bound with `secrets: [BREVO_API_KEY]` on the two email functions only. */
export const BREVO_API_KEY = defineSecret('BREVO_API_KEY')

/**
 * The Brevo-verified sender. functions/.env commits the never-routing placeholder
 * noreply@turnagain.invalid until the owner verifies a sender.
 */
export const MAIL_FROM = defineString('MAIL_FROM')

export const EMAIL_DRY_RUN = defineString('EMAIL_DRY_RUN', { default: '0' })

export const ALLOW_LIVE_ADMIN = defineString('ALLOW_LIVE_ADMIN', { default: '0' })

/**
 * The one reader of the dry-run flag. `.value()` returns `process.env.EMAIL_DRY_RUN || ''` at run
 * time (the declared default is applied by the CLI, not here), so only the exact string
 * '1' means dry run.
 */
export const isEmailDryRun = () => EMAIL_DRY_RUN.value() === '1'

/**
 * The one reader of the development-mode switch, read at run time
 * like the dry-run flag: only the exact string '1' lets the Functions emulator write to a real
 * project. functions/.env commits '0'.
 */
export const isLiveAdminAllowed = () => ALLOW_LIVE_ADMIN.value() === '1'
