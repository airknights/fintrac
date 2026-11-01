import { useState, type ChangeEvent, type FormEvent } from "react";
import type { Account, ImportMapping } from "../api/client.js";
import {
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useImportPreview,
  useImportTransactions,
  useUpdateBalance,
} from "../hooks/api.js";
import { titleCase } from "../format.js";

const TYPES = ["depository", "credit", "loan", "investment", "other"];

export function Accounts() {
  const { data } = useAccounts();
  const accounts = data?.accounts ?? [];

  return (
    <div className="page">
      <h2>Accounts</h2>
      <p className="muted">
        Add your accounts by hand, then import transaction history from a CSV file exported from your
        bank's website. Everything stays on this machine.
      </p>

      <AddAccountForm />

      <div className="card">
        <h3>Your accounts</h3>
        {accounts.length === 0 ? (
          <p className="muted">None yet — add one above.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Type</th>
                <th className="right">Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <AccountRow key={a.account_id} account={a} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AddAccountForm() {
  const create = useCreateAccount();
  const [name, setName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [type, setType] = useState("depository");
  const [subtype, setSubtype] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        institutionName: institutionName.trim() || null,
        type,
        subtype: subtype.trim() || null,
        openingBalance: Number(openingBalance) || 0,
      },
      {
        onSuccess: () => {
          setName("");
          setInstitutionName("");
          setSubtype("");
          setOpeningBalance("0");
        },
      },
    );
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3>Add an account</h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label>
          Name{" "}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="TD Chequing"
            required
          />
        </label>
        <label>
          Institution{" "}
          <input
            type="text"
            value={institutionName}
            onChange={(e) => setInstitutionName(e.target.value)}
            placeholder="TD Canada Trust"
          />
        </label>
        <label>
          Type{" "}
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Subtype{" "}
          <input type="text" value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder="chequing" />
        </label>
        <label>
          Opening balance{" "}
          <input
            type="number"
            value={openingBalance}
            step="0.01"
            onChange={(e) => setOpeningBalance(e.target.value)}
          />
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn primary" type="submit" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add account"}
        </button>
      </div>
      {create.error && <p className="error">{(create.error as Error).message}</p>}
    </form>
  );
}

function AccountRow({ account }: { account: Account }) {
  const updateBalance = useUpdateBalance();
  const deleteAccount = useDeleteAccount();
  const [balance, setBalance] = useState(String(account.current_balance ?? 0));
  const [importing, setImporting] = useState(false);

  return (
    <>
      <tr>
        <td>
          {account.name}
          {account.institution_name && <span className="muted"> · {account.institution_name}</span>}
        </td>
        <td>{titleCase(account.subtype ?? account.type)}</td>
        <td className="right">
          <input
            type="number"
            value={balance}
            style={{ width: 100 }}
            onChange={(e) => setBalance(e.target.value)}
            onBlur={() => {
              const n = Number(balance);
              if (!Number.isNaN(n) && n !== account.current_balance) {
                updateBalance.mutate({ accountId: account.account_id, balance: n });
              }
            }}
          />
        </td>
        <td className="right">
          <button className="btn small" onClick={() => setImporting((v) => !v)}>
            {importing ? "Close" : "Import CSV"}
          </button>
          <button
            className="btn small"
            onClick={() => {
              if (confirm(`Delete ${account.name} and all its transactions?`)) {
                deleteAccount.mutate(account.account_id);
              }
            }}
          >
            Delete
          </button>
        </td>
      </tr>
      {importing && (
        <tr>
          <td colSpan={4}>
            <ImportPanel accountId={account.account_id} onDone={() => setImporting(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

function ImportPanel({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [amountMode, setAmountMode] = useState<"single" | "split">("single");
  const [mapping, setMapping] = useState<Partial<ImportMapping>>({ dateFormat: "YMD" });
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const preview = useImportPreview();
  const doImport = useImportTransactions();

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsv(text);
      preview.mutate({ accountId, csv: text });
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (!csv || mapping.dateCol === undefined || mapping.nameCol === undefined) return;
    if (amountMode === "single" && mapping.amountCol === undefined) return;
    if (amountMode === "split" && mapping.debitCol === undefined && mapping.creditCol === undefined) return;
    doImport.mutate(
      { accountId, csv, mapping: mapping as ImportMapping },
      { onSuccess: (r) => setResult(r) },
    );
  }

  const headers = preview.data?.headers ?? [];

  return (
    <div className="card">
      <h3>Import transactions</h3>
      <input type="file" accept=".csv,text/csv" onChange={handleFile} />
      {fileName && <p className="muted">{fileName}</p>}

      {headers.length > 0 && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.data!.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
            <ColSelect
              label="Date column"
              headers={headers}
              value={mapping.dateCol}
              onChange={(v) => setMapping((m) => ({ ...m, dateCol: v }))}
            />
            <label>
              Date format:{" "}
              <select
                value={mapping.dateFormat}
                onChange={(e) => setMapping((m) => ({ ...m, dateFormat: e.target.value as ImportMapping["dateFormat"] }))}
              >
                <option value="YMD">YYYY-MM-DD</option>
                <option value="MDY">MM/DD/YYYY</option>
                <option value="DMY">DD/MM/YYYY</option>
              </select>
            </label>
            <ColSelect
              label="Description column"
              headers={headers}
              value={mapping.nameCol}
              onChange={(v) => setMapping((m) => ({ ...m, nameCol: v }))}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label>
              <input type="radio" checked={amountMode === "single"} onChange={() => setAmountMode("single")} /> Single
              amount column
            </label>{" "}
            <label style={{ marginLeft: 16 }}>
              <input type="radio" checked={amountMode === "split"} onChange={() => setAmountMode("split")} /> Separate
              debit/credit columns
            </label>
          </div>

          {amountMode === "single" ? (
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 8 }}>
              <ColSelect
                label="Amount column"
                headers={headers}
                value={mapping.amountCol}
                onChange={(v) => setMapping((m) => ({ ...m, amountCol: v, debitCol: undefined, creditCol: undefined }))}
              />
              <label>
                <input
                  type="checkbox"
                  checked={!!mapping.flipSign}
                  onChange={(e) => setMapping((m) => ({ ...m, flipSign: e.target.checked }))}
                />{" "}
                Flip sign (my bank uses negative for spending)
              </label>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              <ColSelect
                label="Debit column"
                headers={headers}
                value={mapping.debitCol}
                onChange={(v) => setMapping((m) => ({ ...m, debitCol: v, amountCol: undefined }))}
              />
              <ColSelect
                label="Credit column"
                headers={headers}
                value={mapping.creditCol}
                onChange={(v) => setMapping((m) => ({ ...m, creditCol: v, amountCol: undefined }))}
              />
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={handleImport} disabled={doImport.isPending}>
              {doImport.isPending ? "Importing…" : "Import"}
            </button>{" "}
            <button className="btn" onClick={onDone}>
              Cancel
            </button>
          </div>
        </>
      )}

      {result && (
        <p className="muted">
          Imported {result.imported} transaction(s)
          {result.skipped > 0 && `, skipped ${result.skipped} row(s) with an unparseable date`}.
        </p>
      )}
      {preview.error && <p className="error">{(preview.error as Error).message}</p>}
      {doImport.error && <p className="error">{(doImport.error as Error).message}</p>}
    </div>
  );
}

function ColSelect({
  label,
  headers,
  value,
  onChange,
}: {
  label: string;
  headers: string[];
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <label>
      {label}:{" "}
      <select value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))}>
        <option value="" disabled>
          choose…
        </option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );
}
