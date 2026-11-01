import { Fragment, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { Account, ImportMapping, ImportResult } from "../api/client.js";
import {
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useImportPreview,
  useImportTransactions,
  useUpdateBalance,
  useUpdateInstitution,
} from "../hooks/api.js";
import { money, titleCase } from "../format.js";
import { DEBT_TYPES, groupByInstitution, inferAccountKind, inferInstitution } from "../accounts.js";
import { InstitutionPicker } from "../components/InstitutionPicker.js";

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
              {groupByInstitution(accounts).map((g) => (
                <Fragment key={g.institution}>
                  <tr className="group-row">
                    <td colSpan={2}>{g.institution}</td>
                    <td className={`right ${g.net < 0 ? "neg" : ""}`}>{money(g.net)}</td>
                    <td></td>
                  </tr>
                  {g.accounts.map((a) => (
                    <AccountRow key={a.account_id} account={a} />
                  ))}
                </Fragment>
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
  // Once the user picks a bank themselves, stop guessing it from the name.
  const [bankPickedByUser, setBankPickedByUser] = useState(false);
  const bankGuessed = !bankPickedByUser && institutionName !== "";
  const [type, setType] = useState("depository");
  const [subtype, setSubtype] = useState("");
  // Same for type/subtype: guessed together until the user edits either one.
  const [kindPickedByUser, setKindPickedByUser] = useState(false);
  const kindGuessed = !kindPickedByUser && subtype !== "";
  const [openingBalance, setOpeningBalance] = useState("0");

  function handleNameChange(value: string) {
    setName(value);
    if (!bankPickedByUser) setInstitutionName(inferInstitution(value) ?? "");
    if (!kindPickedByUser) {
      const kind = inferAccountKind(value);
      setType(kind?.type ?? "depository");
      setSubtype(kind?.subtype ?? "");
    }
  }

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
          // Keep the institution selected: several accounts in a row are often at the same bank.
          setName("");
          setType("depository");
          setSubtype("");
          setKindPickedByUser(false);
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
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="TD Chequing"
            required
          />
        </label>
        <InstitutionPicker
          value={institutionName}
          onChange={(v) => {
            setInstitutionName(v);
            setBankPickedByUser(v !== "");
          }}
        />
        {bankGuessed && <span className="muted" style={{ alignSelf: "center" }}>guessed from name</span>}
        <label>
          Type{" "}
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setKindPickedByUser(true);
            }}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Subtype{" "}
          <input
            type="text"
            value={subtype}
            onChange={(e) => {
              setSubtype(e.target.value);
              setKindPickedByUser(true);
            }}
            placeholder="chequing"
          />
        </label>
        {kindGuessed && <span className="muted" style={{ alignSelf: "center" }}>guessed from name</span>}
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
  const [editingBank, setEditingBank] = useState(false);

  // Pick up balance changes made elsewhere (e.g. set from an imported CSV).
  useEffect(() => setBalance(String(account.current_balance ?? 0)), [account.current_balance]);

  return (
    <>
      <tr>
        <td>{account.name}</td>
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
          <button className="btn small" onClick={() => setEditingBank((v) => !v)}>
            Change bank
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
      {editingBank && (
        <tr>
          <td colSpan={4}>
            <EditBankForm account={account} onDone={() => setEditingBank(false)} />
          </td>
        </tr>
      )}
      {importing && (
        <tr>
          <td colSpan={4}>
            <ImportPanel account={account} onDone={() => setImporting(false)} />
          </td>
        </tr>
      )}
    </>
  );
}

function EditBankForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const update = useUpdateInstitution();
  const [institutionName, setInstitutionName] = useState(account.institution_name ?? "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    update.mutate(
      { accountId: account.account_id, institutionName: institutionName.trim() || null },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <InstitutionPicker label={`Bank for ${account.name}`} value={institutionName} onChange={setInstitutionName} />
      <button className="btn primary small" type="submit" disabled={update.isPending}>
        {update.isPending ? "Saving…" : "Save"}
      </button>
      <button className="btn small" type="button" onClick={onDone}>
        Cancel
      </button>
      {update.error && <span className="error">{(update.error as Error).message}</span>}
    </form>
  );
}

function ImportPanel({ account, onDone }: { account: Account; onDone: () => void }) {
  const accountId = account.account_id;
  const saved = account.import_mapping;
  const [csvs, setCsvs] = useState<string[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [amountMode, setAmountMode] = useState<"single" | "split">(
    saved && (saved.debitCol !== undefined || saved.creditCol !== undefined) ? "split" : "single",
  );
  const [mapping, setMapping] = useState<Partial<ImportMapping>>(
    saved ?? { dateFormat: "YMD", headerRow: 0, dataStartRow: 1 },
  );
  const [result, setResult] = useState<ImportResult | null>(null);
  const preview = useImportPreview();
  const doImport = useImportTransactions();

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setResult(null);
    const texts = await Promise.all(files.map((f) => f.text()));
    setFileNames(files.map((f) => f.name));
    setCsvs(texts);
    // Files from the same bank share a layout, so previewing the first is enough.
    preview.mutate(
      { accountId, csv: texts[0]! },
      {
        onSuccess: (data) => {
          if (saved) return; // keep the rows the user chose last time
          const header = guessHeaderRow(data.rows, data.columnCount);
          setMapping((m) => ({ ...m, headerRow: header, dataStartRow: header + 1 }));
        },
      },
    );
  }

  const mappingComplete =
    mapping.dateCol !== undefined &&
    mapping.nameCol !== undefined &&
    (amountMode === "single"
      ? mapping.amountCol !== undefined
      : mapping.debitCol !== undefined || mapping.creditCol !== undefined);

  function handleImport() {
    if (csvs.length === 0 || !mappingComplete) return;
    doImport.mutate({ accountId, csvs, mapping: mapping as ImportMapping }, { onSuccess: (r) => setResult(r) });
  }

  // Mappings saved before headerRow existed only have hasHeader.
  const headerRow =
    mapping.headerRow !== undefined ? mapping.headerRow : mapping.hasHeader === false ? null : 0;
  const dataStartRow = mapping.dataStartRow ?? (headerRow === null ? 0 : headerRow + 1);
  const rawRows = preview.data?.rows ?? [];
  const columnCount = preview.data?.columnCount ?? 0;
  const headers = Array.from(
    { length: columnCount },
    (_, i) => (headerRow !== null && rawRows[headerRow]?.[i]?.trim()) || `Column ${i + 1}`,
  );
  const rowLabel = (i: number) => {
    const text = (rawRows[i] ?? []).filter((c) => c.trim()).slice(0, 3).join(" · ");
    return `Row ${i + 1}${text ? `: ${text.length > 40 ? text.slice(0, 40) + "…" : text}` : ""}`;
  };

  // Plain-language column names instead of bank jargon (debit/credit).
  const isDebt = DEBT_TYPES.has(account.type);
  const moneyOutSelect = (label: string) => (
    <ColSelect
      label={label}
      headers={headers}
      value={mapping.debitCol}
      onChange={(v) => setMapping((m) => ({ ...m, debitCol: v, amountCol: undefined }))}
    />
  );
  const moneyInSelect = (label: string) => (
    <ColSelect
      label={label}
      headers={headers}
      value={mapping.creditCol}
      onChange={(v) => setMapping((m) => ({ ...m, creditCol: v, amountCol: undefined }))}
    />
  );

  return (
    <div className="card">
      <h3>
        Import transactions into {account.name}{" "}
        <span className="muted">({isDebt ? "credit card / loan" : "bank account"})</span>
      </h3>
      <input type="file" accept=".csv,text/csv" multiple onChange={handleFiles} />
      {fileNames.length > 0 && (
        <p className="muted">
          {fileNames.length === 1 ? fileNames[0] : `${fileNames.length} files: ${fileNames.join(", ")}`}
        </p>
      )}
      {saved && fileNames.length === 0 && (
        <p className="muted">Using the column mapping from your last import — pick files and click Import.</p>
      )}

      {columnCount > 0 && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label>
              Column names are in:{" "}
              <select
                value={headerRow ?? ""}
                onChange={(e) => {
                  const h = e.target.value === "" ? null : Number(e.target.value);
                  setMapping((m) => ({ ...m, headerRow: h, dataStartRow: h === null ? 0 : h + 1 }));
                }}
              >
                <option value="">No header row</option>
                {rawRows.map((_, i) => (
                  <option key={i} value={i}>
                    {rowLabel(i)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Transactions start at:{" "}
              <select
                value={dataStartRow}
                onChange={(e) => setMapping((m) => ({ ...m, dataStartRow: Number(e.target.value) }))}
              >
                {rawRows.map((_, i) => (
                  <option key={i} value={i}>
                    {rowLabel(i)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted" style={{ margin: "6px 0" }}>
            Rows above the transactions (other than the column names) are skipped.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Row</th>
                  {headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rawRows.map((row, i) => (
                  <tr
                    key={i}
                    className={i === headerRow ? "header-row" : i < dataStartRow ? "skipped-row" : undefined}
                  >
                    <td className="muted">
                      {i + 1}
                      {i === headerRow ? " · names" : i < dataStartRow ? " · skipped" : ""}
                    </td>
                    {Array.from({ length: columnCount }, (_, j) => (
                      <td key={j}>{row[j] ?? ""}</td>
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
              <input type="radio" checked={amountMode === "split"} onChange={() => setAmountMode("split")} />{" "}
              {isDebt ? "Separate columns for money spent and payments" : "Separate columns for deposits and withdrawals"}
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
            // Under the hood "out" maps to debitCol and "in" to creditCol.
            <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
              {isDebt ? (
                <>
                  {moneyOutSelect("Money spent")}
                  {moneyInSelect("Payment made")}
                </>
              ) : (
                <>
                  {moneyInSelect("Money deposited")}
                  {moneyOutSelect("Money withdrawn/transferred")}
                </>
              )}
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <ColSelect
              label="Balance column (optional — sets the account balance from the newest row)"
              headers={headers}
              value={mapping.balanceCol}
              onChange={(v) => setMapping((m) => ({ ...m, balanceCol: v }))}
              allowNone
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={handleImport} disabled={doImport.isPending || !mappingComplete}>
              {doImport.isPending ? "Importing…" : csvs.length > 1 ? `Import ${csvs.length} files` : "Import"}
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
          {result.files > 1 && ` from ${result.files} files`}
          {result.skipped > 0 && `, skipped ${result.skipped} row(s) with an unparseable date`}.
          {result.balance !== null && ` Balance set to ${money(result.balance)} (as of ${result.balanceDate}).`}
        </p>
      )}
      {preview.error && <p className="error">{(preview.error as Error).message}</p>}
      {doImport.error && <p className="error">{(doImport.error as Error).message}</p>}
    </div>
  );
}

// Header row guess: the first row filled across (nearly) every column whose
// cells are all text, i.e. no dates or amounts. Account-info lines above the
// header usually have only a cell or two.
function guessHeaderRow(rows: string[][], columnCount: number): number {
  const looksLikeData = (cell: string) => /\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}/.test(cell) || /^-?\$?[\d,]+\.\d{2}$/.test(cell.trim());
  const minFilled = Math.max(2, Math.ceil(columnCount * 0.6));
  const index = rows.findIndex((r) => {
    const filled = r.filter((c) => c.trim());
    return filled.length >= minFilled && !filled.some(looksLikeData);
  });
  return index === -1 ? 0 : index;
}

function ColSelect({
  label,
  headers,
  value,
  onChange,
  allowNone = false,
}: {
  label: string;
  headers: string[];
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  allowNone?: boolean;
}) {
  return (
    <label>
      {label}:{" "}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      >
        <option value="" disabled={!allowNone}>
          {allowNone ? "none" : "choose…"}
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
