import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { usePlaidLink } from 'react-plaid-link'
import { useAccountStore } from '../store/useAccountStore'
import { useTransactionStore } from '../store/useTransactionStore'
import { useToast } from '../components/ui/Toast'
import { createLinkToken, exchangeToken, fetchPlaidAccounts, syncTransactions } from '../services/plaid/client'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import type { Account } from '../types'

const WORKER_CONFIGURED = !!import.meta.env.VITE_CF_WORKER_URL

const ACCOUNT_TYPES: Account['type'][] = ['chequing','savings','credit','investment','loan','other']

const fmtCAD = (n: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n)

// ── Plaid Link wrapper ────────────────────────────────────────────────────────

function PlaidButton({ onLinked }: { onLinked: () => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { accounts, add } = useAccountStore()
  const { upsertMany } = useTransactionStore()
  const { toast } = useToast()

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: async (publicToken, meta) => {
      try {
        toast('Connecting account…', 'info')
        const accessToken = await exchangeToken(publicToken)
        const plaidAccounts = await fetchPlaidAccounts(accessToken)

        for (const pa of plaidAccounts) {
          const existing = accounts.find(a => a.plaidAccountId === pa.plaidAccountId)
          const account: Account = {
            id: existing?.id ?? uuidv4(),
            institutionName: meta.institution?.name,
            name: pa.name,
            type: pa.type === 'depository' ? (pa.subtype === 'savings' ? 'savings' : 'chequing') :
                  pa.type === 'credit' ? 'credit' : 'other',
            balance: pa.balance,
            currency: 'CAD',
            mask: pa.mask,
            plaidAccountId: pa.plaidAccountId,
            plaidAccessToken: accessToken,
          }
          await add(account)

          // Initial transaction sync
          const result = await syncTransactions(accessToken, account.id)
          await upsertMany(result.added)
        }

        toast(`Connected ${plaidAccounts.length} account(s) from ${meta.institution?.name ?? 'bank'}`, 'success')
        onLinked()
      } catch (err: any) {
        toast(`Connection failed: ${err.message}`, 'error')
      }
    },
    onExit: (err) => {
      if (err) toast(err.display_message ?? 'Connection cancelled', 'error')
    },
  })

  const handleClick = async () => {
    setLoading(true)
    try {
      const token = await createLinkToken(uuidv4())
      setLinkToken(token)
    } catch (err: any) {
      toast(`Could not start bank connection: ${err.message}`, 'error')
      setLoading(false)
      return
    }
    setLoading(false)
  }

  // Open link once token is ready
  if (linkToken && ready) {
    open()
    setLinkToken(null)
  }

  return (
    <Button onClick={handleClick} loading={loading || (!!linkToken && !ready)}>
      + Connect Bank
    </Button>
  )
}

// ── Manual account form ───────────────────────────────────────────────────────

function AddAccountModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (a: Account) => void }) {
  const [form, setForm] = useState<Partial<Account>>({
    id: uuidv4(), name: '', type: 'chequing', balance: 0, currency: 'CAD',
  })
  const set = (k: keyof Account, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal open={open} onClose={onClose} title="Add Account">
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Account Name</label>
          <input value={form.name ?? ''} onChange={e => set('name', e.target.value)}
            placeholder="e.g. RBC Chequing"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Current Balance (CAD)</label>
            <input type="number" step="0.01" value={form.balance ?? 0} onChange={e => set('balance', parseFloat(e.target.value) || 0)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (form.name) { onSave(form as Account); onClose() } }}>Add</Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Accounts() {
  const { accounts, add, remove } = useAccountStore()
  const [showAdd, setShowAdd] = useState(false)
  const { toast } = useToast()

  const netWorth = accounts.reduce((s, a) => s + a.balance, 0)

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this account and all its transactions?')) return
    await remove(id)
    toast('Account removed', 'info')
  }

  const byInstitution = accounts.reduce<Record<string, Account[]>>((map, a) => {
    const key = a.institutionName ?? 'Manual'
    return { ...map, [key]: [...(map[key] ?? []), a] }
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Net Worth: <span className="text-white font-semibold">{fmtCAD(netWorth)}</span></p>
        </div>
        <div className="flex gap-2">
          {WORKER_CONFIGURED ? (
            <PlaidButton onLinked={() => {}} />
          ) : (
            <Button variant="secondary" disabled title="Set VITE_CF_WORKER_URL to enable">
              + Connect Bank (needs Worker)
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowAdd(true)}>+ Add Manual</Button>
        </div>
      </div>

      {!accounts.length ? (
        <Card>
          <p className="text-gray-500 text-sm text-center py-8">
            No accounts yet. Connect your bank or add one manually.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(byInstitution).map(([inst, accs]) => (
            <Card key={inst} title={inst}>
              <div className="space-y-2">
                {accs.map(a => (
                  <div key={a.id} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-4 py-3">
                    <div>
                      <span className="text-sm text-gray-200 font-medium">{a.name}</span>
                      {a.mask && <span className="text-xs text-gray-500 ml-2">••••{a.mask}</span>}
                      <span className="text-xs text-gray-600 ml-2 capitalize">{a.type}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold text-white tabular-nums">{fmtCAD(a.balance)}</span>
                      <button onClick={() => handleDelete(a.id)} className="text-gray-600 hover:text-red-400 transition-colors text-xs">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddAccountModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={async (a) => { await add(a); toast('Account added', 'success') }}
      />
    </div>
  )
}
