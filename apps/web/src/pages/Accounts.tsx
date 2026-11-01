import { Fragment, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Account, ImportMapping, ImportResult } from "../api/client.js";
import {
  useAccounts,
  useCreateAccount,
  useDeleteAccount,
  useImportPreview,
  useImportTransactions,
  useUpdateBalance,
  useUpdateAccount,
} from "../hooks/api.js";
import { money, titleCase } from "../format.js";
import { DEBT_TYPES, groupByInstitution, inferAccountKind, inferInstitution } from "../accounts.js";
import { InstitutionPicker } from "../components/InstitutionPicker.js";
import { guessColumns, guessHeaderRow, guessSummary, summaryCells, type SummaryCell } from "../importGuess.js";

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
  const [creditLimit, setCreditLimit] = useState("");

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
        creditLimit: type === "credit" && creditLimit.trim() !== "" ? Number(creditLimit) : null,
      },
      {
        onSuccess: () => {
          // Keep the institution selected: several accounts in a row are often at the same bank.
          setName("");
          setType("depository");
          setSubtype("");
          setKindPickedByUser(false);
          setOpeningBalance("0");
          setCreditLimit("");
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
        <label title="As your bank shows it today. Leave 0 to take it from an imported CSV's balance column.">
          {DEBT_TYPES.has(type) ? "Current balance owed" : "Current balance"}{" "}
          <input
            type="number"
            value={openingBalance}
            step="0.01"
            onChange={(e) => setOpeningBalance(e.target.value)}
          />
        </label>
        {type === "credit" && (
          <label title="Available credit is worked out as limit minus balance owed.">
            Credit limit{" "}
            <input
              type="number"
              value={creditLimit}
              step="0.01"
              min="0"
              placeholder="optional"
              onChange={(e) => setCreditLimit(e.target.value)}
            />
          </label>
        )}
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
  const [limit, setLimit] = useState(account.credit_limit === null ? "" : String(account.credit_limit));
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState(false);

  // Pick up changes made elsewhere (imports can move the balance and the limit).
  useEffect(() => setBalance(String(account.current_balance ?? 0)), [account.current_balance]);
  useEffect(() => setLimit(account.credit_limit === null ? "" : String(account.credit_limit)), [account.credit_limit]);

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
          <div className="muted small-note">
            {account.balance_as_of ? `as of ${account.balance_as_of} + later transactions` : "from transactions"}
          </div>
          {account.type === "credit" && (
            <>
              <label className="small-note">
                Limit{" "}
                <input
                  type="number"
                  value={limit}
                  min="0"
                  placeholder="—"
                  style={{ width: 100 }}
                  onChange={(e) => setLimit(e.target.value)}
                  onBlur={() => {
                    const n = limit.trim() === "" ? null : Number(limit);
                    if (n !== null && Number.isNaN(n)) return;
                    if (n !== account.credit_limit) {
                      updateBalance.mutate({ accountId: account.account_id, creditLimit: n });
                    }
                  }}
                />
              </label>
              <div className="muted small-note">
                {account.available_credit === null
                  ? "Available: set a limit"
                  : `Available: ${money(account.available_credit)}`}
              </div>
            </>
          )}
        </td>
        <td className="right">
          <Link className="btn small" to={`/transactions?account=${account.account_id}`}>
            Transactions
          </Link>
          <button className="btn small" onClick={() => setImporting((v) => !v)}>
            {importing ? "Close" : "Import CSV"}
          </button>
          <button className="btn small" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit"}
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
      {editing && (
        <tr>
          <td colSpan={4}>
            <EditAccountForm account={account} onDone={() => setEditing(false)} />
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

function EditAccountForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const update = useUpdateAccount();
  const [institutionName, setInstitutionName] = useState(account.institution_name ?? "");
  const [type, setType] = useState(account.type);
  const [subtype, setSubtype] = useState(account.subtype ?? "");
  const [creditLimit, setCreditLimit] = useState(account.credit_limit === null ? "" : String(account.credit_limit));
  // The stored balance is "money in the account" for bank types but "amount
  // owed" for credit/loan, so switching between them flips its meaning.
  const debtChanged = DEBT_TYPES.has(type) !== DEBT_TYPES.has(account.type);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    update.mutate(
      {
        accountId: account.account_id,
        institutionName: institutionName.trim() || null,
        type,
        subtype: subtype.trim() || null,
        // Only cards / lines of credit have a limit; blank clears it.
        ...(type === "credit" ? { creditLimit: creditLimit.trim() === "" ? null : Number(creditLimit) } : {}),
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <strong>Edit {account.name}</strong>
        <InstitutionPicker label="Bank" value={institutionName} onChange={setInstitutionName} />
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
        {type === "credit" && (
          <label title="Available credit is worked out as limit minus balance owed.">
            Credit limit{" "}
            <input
              type="number"
              value={creditLimit}
              step="0.01"
              min="0"
              placeholder="e.g. 5000"
              style={{ width: 110 }}
              onChange={(e) => setCreditLimit(e.target.value)}
            />
          </label>
        )}
        <button className="btn primary small" type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save"}
        </button>
        <button className="btn small" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
      {debtChanged && (
        <p className="muted" style={{ marginBottom: 0 }}>
          {DEBT_TYPES.has(type)
            ? `The balance (${money(account.current_balance)}) will be read as the amount owed. `
            : `The balance (${money(account.current_balance)}) will be read as money in the account, not owed. `}
          Check it after saving and correct it if needed.
        </p>
      )}
      {update.error && <p className="error">{(update.error as Error).message}</p>}
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
  const [columnsGuessed, setColumnsGuessed] = useState(false);
  // Sliding window over the file's transaction rows (indexes into txRows below).
  const [windowStart, setWindowStart] = useState(0);
  const [windowEnd, setWindowEnd] = useState(PREVIEW_PAGE);
  const preview = useImportPreview();

  // Replace the column choices with a best guess for the given header row.
  function applyGuess(rows: string[][], columnCount: number, header: number | null) {
    const dataStart = header === null ? 0 : header + 1;
    const { amountMode: mode, ...cols } = guessColumns(
      header === null ? null : (rows[header] ?? null),
      rows.slice(dataStart),
      columnCount,
      { creditCard: account.type === "credit" },
    );
    const summary = guessSummary(summaryCells(rows, header, dataStart), { creditCard: account.type === "credit" });
    setAmountMode(mode);
    setMapping((m) => ({ dateFormat: m.dateFormat, ...cols, ...summary, headerRow: header, dataStartRow: dataStart }));
    setColumnsGuessed(true);
  }
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
          if (!saved) {
            applyGuess(data.rows, data.columnCount, guessHeaderRow(data.rows, data.columnCount));
            return;
          }
          // Keep the settings the user chose last time, but fill in summary
          // values (balance etc. above the transactions) if they were never picked.
          if (saved.summaryBalance || saved.summaryAvailable || saved.summaryDate) return;
          setMapping((m) => {
            const header = m.headerRow !== undefined ? m.headerRow : m.hasHeader === false ? null : 0;
            const start = m.dataStartRow ?? (header === null ? 0 : header + 1);
            const cells = summaryCells(data.rows, header, start);
            return { ...m, ...guessSummary(cells, { creditCard: account.type === "credit" }) };
          });
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
  // Only the first rows can sensibly be the header / first transaction.
  const pickableRows = rawRows.slice(0, Math.max(PREVIEW_PAGE, dataStartRow + 1, (headerRow ?? 0) + 1));
  const txRows = rawRows.slice(dataStartRow);
  const visibleTx = txRows.slice(windowStart, windowEnd);
  const shownEnd = Math.min(windowEnd, txRows.length);

  // Back to the first page whenever a new file is previewed or the start row moves.
  useEffect(() => {
    setWindowStart(0);
    setWindowEnd(PREVIEW_PAGE);
  }, [preview.data, dataStartRow]);

  function loadMore(count: number) {
    const end = Math.min(txRows.length, windowEnd + count);
    setWindowEnd(end);
    setWindowStart((start) => Math.max(start, end - PREVIEW_MAX_VISIBLE)); // drop rows off the top
  }

  // Single values (balance, available credit, dates) in the rows above the transactions.
  const infoCells = summaryCells(rawRows, headerRow, dataStartRow);

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
    // width 0 + min-width 100%: take the table cell's width instead of growing
    // it to fit wide previews, so the preview below can scroll horizontally.
    <div className="card" style={{ width: 0, minWidth: "100%" }}>
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
                  // Column names changed, so re-guess which column is which.
                  applyGuess(rawRows, columnCount, e.target.value === "" ? null : Number(e.target.value));
                }}
              >
                <option value="">No header row</option>
                {pickableRows.map((_, i) => (
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
                {pickableRows.map((_, i) => (
                  <option key={i} value={i}>
                    {rowLabel(i)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted" style={{ margin: "6px 0" }}>
            Rows above the transactions (other than the column names) are skipped.
            {columnsGuessed && " Columns below were picked automatically — check them before importing."}
          </p>
          <p className="muted" style={{ margin: "6px 0" }}>
            {txRows.length === 0
              ? "No transaction rows."
              : `Showing transactions ${windowStart + 1}–${shownEnd} of ${txRows.length}`}
            {windowStart > 0 && " (earlier rows hidden to keep the page fast)"}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="table preview-table">
              <thead>
                <tr>
                  <th>Row</th>
                  {headers.map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Header and skipped rows sit above the transactions; show them until the window moves past. */}
                {windowStart === 0 &&
                  rawRows.slice(0, dataStartRow).map((row, i) => (
                    <tr key={`pre-${i}`} className={i === headerRow ? "header-row" : "skipped-row"}>
                      <td className="muted">
                        {i + 1}
                        {i === headerRow ? " · names" : " · skipped"}
                      </td>
                      {Array.from({ length: columnCount }, (_, j) => (
                        <td key={j}>{row[j] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                {visibleTx.map((row, k) => {
                  const rowNumber = dataStartRow + windowStart + k + 1;
                  return (
                    <tr key={rowNumber}>
                      <td className="muted">{rowNumber}</td>
                      {Array.from({ length: columnCount }, (_, j) => (
                        <td key={j}>{row[j] ?? ""}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {shownEnd < txRows.length && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <button className="btn small" type="button" onClick={() => loadMore(PREVIEW_PAGE)}>
                Load more
              </button>
              <button className="btn small" type="button" onClick={() => loadMore(100)}>
                Load next 100
              </button>
              <span className="muted">{txRows.length - shownEnd} more</span>
            </div>
          )}

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
          {account.type === "credit" && (
            <div style={{ marginTop: 8 }}>
              <ColSelect
                label="Available credit column (optional — sets the credit limit; otherwise available = limit − balance)"
                headers={headers}
                value={mapping.availableCol}
                onChange={(v) => setMapping((m) => ({ ...m, availableCol: v }))}
                allowNone
              />
            </div>
          )}

          {infoCells.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong>From the info above the transactions</strong>{" "}
              <span className="muted">(used instead of the columns above when set)</span>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 6 }}>
                <CellSelect
                  label="Current balance"
                  cells={infoCells.filter((c) => c.kind === "amount")}
                  value={mapping.summaryBalance}
                  onChange={(v) => setMapping((m) => ({ ...m, summaryBalance: v }))}
                />
                {account.type === "credit" && (
                  <CellSelect
                    label="Available credit"
                    cells={infoCells.filter((c) => c.kind === "amount")}
                    value={mapping.summaryAvailable}
                    onChange={(v) => setMapping((m) => ({ ...m, summaryAvailable: v }))}
                  />
                )}
                <CellSelect
                  label="Balance as of"
                  cells={infoCells.filter((c) => c.kind === "date")}
                  value={mapping.summaryDate}
                  onChange={(v) => setMapping((m) => ({ ...m, summaryDate: v }))}
                  noneLabel="newest transaction in the file"
                />
              </div>
            </div>
          )}

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
          {result.balance !== null && ` Current balance: ${money(result.balance)}`}
          {result.balanceDate && ` (from the file's balance on ${result.balanceDate}, plus anything later)`}
          {result.balance !== null && "."}
          {result.creditLimit !== null && ` Credit limit set to ${money(result.creditLimit)} from the file's available credit.`}
        </p>
      )}
      {result?.balanceCheck &&
        (result.balanceCheck.mismatches === 0 ? (
          <p className="pos">
            Balance check passed: every row's amount matches the change in the bank's balance (
            {result.balanceCheck.checked} checked).
          </p>
        ) : (
          <p className="error">
            Balance check: {result.balanceCheck.mismatches} of {result.balanceCheck.checked} rows don't match the
            change in the bank's balance (first on {result.balanceCheck.firstMismatchDate}).
            {result.balanceCheck.mismatches === result.balanceCheck.checked
              ? " Every row is off — the money in/out columns are probably swapped, or 'Flip sign' needs changing."
              : " The file may be missing transactions, or rows on the same day are out of order."}
          </p>
        ))}
      {preview.error && <p className="error">{(preview.error as Error).message}</p>}
      {doImport.error && <p className="error">{(doImport.error as Error).message}</p>}
    </div>
  );
}

// Picks one value from the info rows above the transactions.
function CellSelect({
  label,
  cells,
  value,
  onChange,
  noneLabel = "none",
}: {
  label: string;
  cells: SummaryCell[];
  value: { row: number; col: number } | undefined;
  onChange: (v: { row: number; col: number } | undefined) => void;
  noneLabel?: string;
}) {
  return (
    <label>
      {label}:{" "}
      <select
        value={value ? `${value.row}:${value.col}` : ""}
        onChange={(e) => {
          if (!e.target.value) return onChange(undefined);
          const [row, col] = e.target.value.split(":").map(Number);
          onChange({ row: row!, col: col! });
        }}
      >
        <option value="">{noneLabel}</option>
        {cells.map((c) => (
          <option key={`${c.row}:${c.col}`} value={`${c.row}:${c.col}`}>
            {c.label}: {c.value}
          </option>
        ))}
      </select>
    </label>
  );
}

const PREVIEW_PAGE = 20; // transactions per "Load more"
const PREVIEW_MAX_VISIBLE = 150; // cap on transactions rendered at once

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
