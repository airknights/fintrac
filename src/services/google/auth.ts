/**
 * Google Identity Services — browser-only OAuth.
 * Uses the implicit / token flow: no client_secret, no server needed.
 * The access_token returned can call Google Sheets API directly.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

// Scopes needed: read + write the user's spreadsheet
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

declare global {
  interface Window {
    google: any
    onGoogleScriptLoad: () => void
  }
}

let scriptLoaded = false
let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => { scriptLoaded = true; resolve() }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export interface GoogleTokenResult {
  accessToken: string
  expiresAt: number     // Date.now() + expires_in_ms
  email: string
  name: string
  picture: string
}

export async function signInWithGoogle(): Promise<GoogleTokenResult> {
  await loadScript()

  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (response: any) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error))
          return
        }

        try {
          const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${response.access_token}` },
          })
          const user = await userRes.json()

          resolve({
            accessToken: response.access_token,
            expiresAt: Date.now() + response.expires_in * 1000,
            email: user.email ?? '',
            name: user.name ?? '',
            picture: user.picture ?? '',
          })
        } catch (err) {
          reject(err)
        }
      },
    })

    tokenClient.requestAccessToken({ prompt: '' })
  })
}

export function signOut(accessToken: string) {
  if (window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {})
  }
}
