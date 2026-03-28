import { useState } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { useSync } from '../hooks/useSync'
import { useBudgetStore } from '../store/useBudgetStore'
import { useToast } from '../components/ui/Toast'
import { createSpreadsheet } from '../services/google/sheets'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import { db } from '../services/db/dexie'
import { v4 as uuidv4 } from 'uuid'
import type { Category } from '../types'

export default function Settings() {
  const auth = useAuthStore()
  const { sync, pullFromSheets, pushToSheets, syncing } = useSync()
  const { categories, addCategory, updateCategory, removeCategory } = useBudgetStore()
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)
  const [editCat, setEditCat] = useState<Category | null>(null)
  const [showCatModal, setShowCatModal] = useState(false)

  const handleCreateSheet = async () => {
    if (!auth.isTokenValid()) { toast('Sign in with Google first', 'error'); return }
    setCreating(true)
    try {
      const sid = await createSpreadsheet(auth.accessToken!)
      auth.setSpreadsheetId(sid)
      toast('Spreadsheet created! ID saved.', 'success')
    } catch (err: any) {
      toast(`Error: ${err.message}`, 'error')
    }
    setCreating(false)
  }

  const handleClearData = async () => {
    if (!confirm('Delete ALL local data? This cannot be undone.')) return
    await db.transactions.clear()
    await db.accounts.clear()
    await db.budgets.clear()
    window.location.reload()
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Google Account */}
      <Card title="Google Account & Storage">
        {auth.isTokenValid() ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {auth.picture && <img src={auth.picture} className="w-10 h-10 rounded-full" alt="" />}
              <div>
                <p className="text-sm font-medium text-gray-200">{auth.name}</p>
                <p className="text-xs text-gray-500">{auth.email}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={auth.signOut} className="ml-auto">Sign out</Button>
            </div>

            <div className="border-t border-zinc-800 pt-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Spreadsheet ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={auth.spreadsheetId ?? ''}
                    onChange={e => auth.setSpreadsheetId(e.target.value)}
                    placeholder="Paste an existing spreadsheet ID, or create new →"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 font-mono text-xs"
                  />
                  <Button variant="secondary" size="sm" loading={creating} onClick={handleCreateSheet}>
                    Create new
                  </Button>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Find it in the URL: docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => pullFromSheets().then(() => toast('Pulled from Sheets', 'success')).catch(e => toast(e.message, 'error'))}>
                  ↓ Pull from Sheets
                </Button>
                <Button variant="secondary" size="sm" onClick={() => pushToSheets().then(() => toast('Pushed to Sheets', 'success')).catch(e => toast(e.message, 'error'))}>
                  ↑ Push to Sheets
                </Button>
                <Button size="sm" onClick={sync} loading={syncing}>⟳ Full Sync</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">
              Sign in with Google to sync your data to your own Google Sheet. Your data never touches any third-party server.
            </p>
            <Button onClick={auth.signIn} loading={auth.signing}>Sign in with Google</Button>
          </div>
        )}
      </Card>

      {/* Cloudflare Worker */}
      <Card title="Live Bank Sync (Cloudflare Worker)">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${import.meta.env.VITE_CF_WORKER_URL ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            <span className="text-sm text-gray-300">
              {import.meta.env.VITE_CF_WORKER_URL ? 'Worker configured' : 'Not configured'}
            </span>
          </div>
          {import.meta.env.VITE_CF_WORKER_URL ? (
            <p className="text-xs text-gray-600 font-mono">{import.meta.env.VITE_CF_WORKER_URL}</p>
          ) : (
            <p className="text-sm text-gray-500">
              Add <code className="bg-zinc-800 px-1 rounded text-xs">VITE_CF_WORKER_URL</code> to your <code className="bg-zinc-800 px-1 rounded text-xs">.env</code> file to enable live bank feeds. See <code className="bg-zinc-800 px-1 rounded text-xs">cloudflare-worker/README.md</code> for setup steps.
            </p>
          )}
        </div>
      </Card>

      {/* Categories */}
      <Card title="Categories" action={
        <Button size="sm" onClick={() => { setEditCat(null); setShowCatModal(true) }}>+ Add</Button>
      }>
        <div className="grid grid-cols-2 gap-2">
          {categories.map(c => (
            <div key={c.id} className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color }} />
              <span className="text-sm text-gray-300 flex-1 truncate">{c.name}</span>
              <button onClick={() => { setEditCat(c); setShowCatModal(true) }} className="text-gray-600 hover:text-gray-300 text-xs">✎</button>
              <button onClick={async () => { await removeCategory(c.id); toast('Category removed', 'info') }} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
            </div>
          ))}
        </div>
      </Card>

      {/* Danger zone */}
      <Card title="Data">
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            All data is stored locally in your browser (IndexedDB) and optionally synced to your Google Sheet.
          </p>
          <Button variant="danger" size="sm" onClick={handleClearData}>
            Clear all local data
          </Button>
        </div>
      </Card>

      <CategoryModal
        open={showCatModal}
        onClose={() => { setShowCatModal(false); setEditCat(null) }}
        onSave={async (c) => {
          if (editCat) { await updateCategory(c); toast('Category updated', 'success') }
          else         { await addCategory(c);    toast('Category added', 'success')   }
        }}
        initial={editCat}
      />
    </div>
  )
}

function CategoryModal({ open, onClose, onSave, initial }: {
  open: boolean; onClose: () => void; onSave: (c: Category) => void; initial: Category | null
}) {
  const [name, setName]   = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? '#6366f1')

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Category' : 'Add Category'}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Subscriptions"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Colour</label>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-9 w-16 rounded cursor-pointer bg-zinc-800 border border-zinc-700" />
            <span className="text-sm text-gray-400 font-mono">{color}</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (name) { onSave({ id: initial?.id ?? uuidv4(), name, color }); onClose() } }}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}
