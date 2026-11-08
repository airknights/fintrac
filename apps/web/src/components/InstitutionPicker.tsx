import { useState } from "react";
import { INSTITUTIONS } from "../accounts.js";

const OTHER = "__other__";

// Bank dropdown with an "Other…" option that reveals a free-text field.
// value is the bank name ("" for none).
export function InstitutionPicker({
  value,
  onChange,
  label = "Institution",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [other, setOther] = useState(() => value !== "" && !INSTITUTIONS.includes(value));

  return (
    <>
      <label>
        {label}{" "}
        <select
          value={other ? OTHER : value}
          onChange={(e) => {
            const v = e.target.value;
            setOther(v === OTHER);
            onChange(v === OTHER ? "" : v);
          }}
        >
          <option value="">choose…</option>
          {INSTITUTIONS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </select>
      </label>
      {other && (
        <label>
          Institution name{" "}
          <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="e.g. Scotiabank" autoFocus />
        </label>
      )}
    </>
  );
}
