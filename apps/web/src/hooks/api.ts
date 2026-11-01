import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type Account,
  type DebtPlanResponse,
  type DebtsResponse,
  type ImportMapping,
  type ImportPreview,
  type ImportResult,
  type NetWorth,
  type SpendingResponse,
} from "../api/client.js";

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["net-worth"] });
  qc.invalidateQueries({ queryKey: ["accounts"] });
  qc.invalidateQueries({ queryKey: ["spending"] });
  qc.invalidateQueries({ queryKey: ["debts"] });
}

export function useNetWorth() {
  return useQuery({ queryKey: ["net-worth"], queryFn: () => api.get<NetWorth>("/net-worth") });
}

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<{ accounts: Account[] }>("/accounts"),
  });
}

export function useSpending(days = 30) {
  return useQuery({
    queryKey: ["spending", days],
    queryFn: () => api.get<SpendingResponse>(`/spending?days=${days}`),
  });
}

export function useDebts() {
  return useQuery({ queryKey: ["debts"], queryFn: () => api.get<DebtsResponse>("/debts") });
}

export function useDebtPlan() {
  return useMutation({
    mutationFn: (monthlyBudget: number) => api.post<DebtPlanResponse>("/debt-plan", { monthlyBudget }),
  });
}

export interface CreateAccountPayload {
  name: string;
  institutionName?: string | null;
  type: string;
  subtype?: string | null;
  isoCurrency?: string;
  openingBalance?: number;
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAccountPayload) => api.post<{ accountId: string }>("/accounts", payload),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { accountId: string; balance: number }) =>
      api.patch(`/accounts/${payload.accountId}/balance`, { balance: payload.balance }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateInstitution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { accountId: string; institutionName: string | null }) =>
      api.patch(`/accounts/${payload.accountId}/institution`, { institutionName: payload.institutionName }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => api.del(`/accounts/${accountId}`),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useImportPreview() {
  return useMutation({
    mutationFn: (payload: { accountId: string; csv: string }) =>
      api.post<ImportPreview>(`/accounts/${payload.accountId}/import-preview`, { csv: payload.csv }),
  });
}

export function useImportTransactions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { accountId: string; csvs: string[]; mapping: ImportMapping }) =>
      api.post<ImportResult>(`/accounts/${payload.accountId}/import`, {
        csvs: payload.csvs,
        mapping: payload.mapping,
      }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { accountId: string; apr: number | null; minimum: number | null }) =>
      api.post(`/debts/${payload.accountId}/override`, { apr: payload.apr, minimum: payload.minimum }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["debts"] }),
  });
}
