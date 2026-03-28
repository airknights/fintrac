import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { signInWithGoogle, signOut } from '../services/google/auth'

interface AuthState {
  accessToken: string | null
  expiresAt: number | null
  spreadsheetId: string | null
  email: string | null
  name: string | null
  picture: string | null
  signing: boolean
  error: string | null

  signIn: () => Promise<void>
  signOut: () => void
  setSpreadsheetId: (id: string) => void
  isTokenValid: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      expiresAt: null,
      spreadsheetId: null,
      email: null,
      name: null,
      picture: null,
      signing: false,
      error: null,

      isTokenValid() {
        const { accessToken, expiresAt } = get()
        return !!accessToken && !!expiresAt && Date.now() < expiresAt - 60_000
      },

      async signIn() {
        set({ signing: true, error: null })
        try {
          const result = await signInWithGoogle()
          set({
            accessToken: result.accessToken,
            expiresAt: result.expiresAt,
            email: result.email,
            name: result.name,
            picture: result.picture,
            signing: false,
          })
        } catch (err: any) {
          set({ signing: false, error: err.message })
        }
      },

      signOut() {
        const { accessToken } = get()
        if (accessToken) signOut(accessToken)
        set({
          accessToken: null,
          expiresAt: null,
          email: null,
          name: null,
          picture: null,
          spreadsheetId: null,
        })
      },

      setSpreadsheetId(id) {
        set({ spreadsheetId: id })
      },
    }),
    {
      name: 'fintrac-auth',
      // Don't persist the access token — user re-auths on each visit (implicit flow)
      partialize: (s) => ({
        spreadsheetId: s.spreadsheetId,
        email: s.email,
        name: s.name,
        picture: s.picture,
      }),
    }
  )
)
