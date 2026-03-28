import Papa from 'papaparse'
import { v4 as uuidv4 } from 'uuid'
import type { Transaction } from '../../types'

// ── Bank column definitions ───────────────────────────────────────────────────

interface ColMap {
  date: string
  name: string
  amount?: string        // signed single column
  debit?: string         // separate debit (positive = expense)
  credit?: string        // separate credit (positive = income)
  merchant?: string
  detectKey: string      // substring of header row used to auto-detect
}

const BANK_FORMATS: Record<string, ColMap> = {
  rbc: {
    detectKey: 'Transaction Date',
    date: 'Transaction Date',
    name: 'Description 1',
    merchant: 'Description 2',
    debit: 'CAD$',
    credit: '',
  },
  td: {
    detectKey: 'date,description,debit,credit',
    date: 'date',
    name: 'description',
    debit: 'debit',
    credit: 'credit',
  },
  cibc: {
    detectKey: 'Date,Description,Debit,Credit',
    date: 'Date',
    name: 'Description',
    debit: 'Debit',
    credit: 'Credit',
  },
  bmo: {
    detectKey: 'First Bank Card',
    date: 'Date Posted',
    name: 'Description',
    amount: 'Transaction Amount',
  },
  scotiabank: {
    detectKey: 'Withdrawals,Deposits',
    date: 'Date',
    name: 'Description',
    debit: 'Withdrawals',
    credit: 'Deposits',
  },
  tangerine: {
    detectKey: 'Date,Transaction,Name,Memo,Amount',
    date: 'Date',
    name: 'Name',
    merchant: 'Memo',
    amount: 'Amount',
  },
  desjardins: {
    detectKey: 'Seq.,Date,Description',
    date: 'Date',
    name: 'Description',
    debit: 'Withdrawals',
    credit: 'Deposits',
  },
}

function detectBank(headerLine: string): ColMap {
  for (const [, fmt] of Object.entries(BANK_FORMATS)) {
    if (headerLine.includes(fmt.detectKey.split(',')[0])) return fmt
  }
  // Generic fallback
  return { detectKey: '', date: 'Date', name: 'Description', amount: 'Amount' }
}

// ── Date normaliser ───────────────────────────────────────────────────────────

function normaliseDate(raw: string): string {
  const s = raw.trim()
  // YYYY-MM-DD → already fine
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // MM/DD/YYYY or M/D/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) return `${slash[3]}-${slash[1].padStart(2,'0')}-${slash[2].padStart(2,'0')}`
  // DD-Mon-YYYY  e.g. 01-Jan-2024
  const mon = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/)
  if (mon) {
    const months: Record<string,string> = {
      Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
      Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
    }
    return `${mon[3]}-${months[mon[2]] ?? '01'}-${mon[1]}`
  }
  return s
}

function parseAmt(raw: string | undefined): number {
  if (!raw) return 0
  return parseFloat(raw.replace(/[$,\s]/g, '')) || 0
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function parseCSV(file: File, accountId: string): Promise<Transaction[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data: rows, errors }) => {
        if (errors.length && !rows.length) {
          reject(new Error(errors[0]?.message ?? 'CSV parse error'))
          return
        }

        const records = rows as Record<string, string>[]
        if (!records.length) { resolve([]); return }

        const headerLine = Object.keys(records[0]).join(',')
        const cols = detectBank(headerLine)
        const txns: Transaction[] = []

        for (const row of records) {
          const dateRaw = row[cols.date]?.trim()
          if (!dateRaw) continue

          const nameRaw = row[cols.name]?.trim() || 'Unknown'
          const merchantRaw = cols.merchant ? row[cols.merchant]?.trim() : undefined

          let amount = 0
          if (cols.amount) {
            amount = parseAmt(row[cols.amount])
            // BMO stores debits as negative — flip to positive (expense convention)
            if (headerLine.includes('First Bank Card')) amount = -amount
            // Tangerine stores expenses as negative — flip
            if (headerLine.includes('Memo,Amount')) amount = -amount
          } else {
            const debit  = parseAmt(cols.debit  ? row[cols.debit]  : undefined)
            const credit = parseAmt(cols.credit ? row[cols.credit] : undefined)
            amount = debit - credit   // positive = expense
          }

          txns.push({
            id: uuidv4(),
            accountId,
            date: normaliseDate(dateRaw),
            name: nameRaw,
            merchantName: merchantRaw || undefined,
            amount,
            currency: 'CAD',
            category: 'Other',
            pending: false,
            source: 'import',
          })
        }

        resolve(txns.filter(t => t.date.length === 10))
      },
      error: (err: Error) => reject(err),
    })
  })
}
