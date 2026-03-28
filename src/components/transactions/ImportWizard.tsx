import { useState, useRef } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { parseCSV } from '../../services/importers/csv'
import { useAccountStore } from '../../store/useAccountStore'
import { useTransactionStore } from '../../store/useTransactionStore'
import { useToast } from '../ui/Toast'
import type { Transaction } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

const BANK_INSTRUCTIONS: Record<string, string> = {
  RBC:        'Online Banking → Accounts → Download Transactions → CSV',
  TD:         'EasyWeb → Accounts → Download → CSV',
  CIBC:       'Online Banking → Account Activity → Download → QFX/CSV',
  BMO:        'Online Banking → Accounts → Download Transactions → CSV',
  Scotiabank: 'Scotia Online → Accounts → Transaction History → Download → CSV',
  Tangerine:  'Online Banking → Accounts → Download transactions → CSV',
  Desjardins: 'AccèsD → Accounts → Download transactions → CSV',
}

export default function ImportWizard({ open, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [accountId, setAccountId] = useState('')
  const [preview, setPreview] = useState<Transaction[]>([])
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { accounts } = useAccountStore()
  const { importMany } = useTransactionStore()
  const { toast } = useToast()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !accountId) return
    try {
      const txns = await parseCSV(file, accountId)
      setPreview(txns)
      setStep(2)
    } catch (err: any) {
      toast(`Parse error: ${err.message}`, 'error')
    }
  }

  const handleImport = async () => {
    setImporting(true)
    const { added, skipped } = await importMany(preview)
    setImporting(false)
    toast(`Imported ${added} transactions${skipped ? ` (${skipped} duplicates skipped)` : ''}`, 'success')
    setStep(3)
  }

  const handleClose = () => {
    setStep(1)
    setPreview([])
    setAccountId('')
    if (fileRef.current) fileRef.current.value = ''
    onClose()
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Math.abs(n))

  return (
    <Modal open={open} onClose={handleClose} title="Import Transactions" maxWidth="max-w-2xl">
      {step === 1 && (
        <div className="space-y-5">
          <p className="text-sm text-gray-400">
            Export a CSV from your bank's online portal, then upload it here.
            Column formats for major Canadian banks are detected automatically.
          </p>

          {/* Bank instructions */}
          <details className="bg-zinc-800 rounded-lg p-3">
            <summary className="text-sm text-gray-300 cursor-pointer select-none">
              How to export from your bank ▾
            </summary>
            <div className="mt-3 space-y-1.5">
              {Object.entries(BANK_INSTRUCTIONS).map(([bank, instruction]) => (
                <div key={bank} className="flex gap-3 text-xs">
                  <span className="text-gray-400 w-24 shrink-0 font-medium">{bank}</span>
                  <span className="text-gray-500">{instruction}</span>
                </div>
              ))}
            </div>
          </details>

          {/* Account selector */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Import into account</label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select account…</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* File input */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">CSV file</label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv"
              disabled={!accountId}
              onChange={handleFile}
              className="block w-full text-sm text-gray-400
                file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                file:text-sm file:bg-indigo-600 file:text-white
                hover:file:bg-indigo-500 file:cursor-pointer
                disabled:opacity-50"
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Found <strong className="text-white">{preview.length}</strong> transactions. Review a sample below.
          </p>
          <div className="max-h-64 overflow-y-auto border border-zinc-800 rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-900">
                <tr className="border-b border-zinc-800">
                  {['Date','Description','Amount'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 20).map((t, i) => (
                  <tr key={i} className="border-b border-zinc-800/50">
                    <td className="px-3 py-1.5 text-gray-400">{t.date}</td>
                    <td className="px-3 py-1.5 text-gray-200 max-w-xs truncate">{t.name}</td>
                    <td className={`px-3 py-1.5 font-medium ${t.amount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {t.amount > 0 ? '-' : '+'}{fmt(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.length > 20 && (
            <p className="text-xs text-gray-600">…and {preview.length - 20} more</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={handleImport} loading={importing}>
              Import {preview.length} transactions
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="text-center py-8 space-y-3">
          <div className="text-4xl">✓</div>
          <p className="text-gray-300 font-medium">Import complete!</p>
          <p className="text-sm text-gray-500">
            Don't forget to categorise your transactions.
          </p>
          <Button onClick={handleClose} className="mx-auto">Done</Button>
        </div>
      )}
    </Modal>
  )
}
