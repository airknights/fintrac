import { useAuthStore } from '../../store/useAuthStore'
import { useSync } from '../../hooks/useSync'
import Button from '../ui/Button'

export default function Header() {
  const auth = useAuthStore()
  const { syncing, lastSync, sync, error } = useSync()

  return (
    <header className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-6 shrink-0">
      {/* Sync status */}
      <div className="flex items-center gap-3">
        {auth.isTokenValid() && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={sync}
              loading={syncing}
              disabled={syncing}
            >
              {syncing ? 'Syncing…' : '⟳ Sync'}
            </Button>
            {lastSync && (
              <span className="text-xs text-gray-600">
                Last sync {lastSync.toLocaleTimeString()}
              </span>
            )}
            {error && (
              <span className="text-xs text-red-400" title={error}>⚠ Sync error</span>
            )}
          </>
        )}
      </div>

      {/* User */}
      <div className="flex items-center gap-3">
        {auth.isTokenValid() ? (
          <>
            {auth.picture && (
              <img src={auth.picture} alt="" className="w-7 h-7 rounded-full" />
            )}
            <span className="text-sm text-gray-400 hidden sm:block">{auth.email}</span>
            <Button variant="ghost" size="sm" onClick={auth.signOut}>
              Sign out
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={auth.signIn} loading={auth.signing}>
            Connect Google
          </Button>
        )}
      </div>
    </header>
  )
}
