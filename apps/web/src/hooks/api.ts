import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  type TransactionsResponse,
} from "../api/client.js";

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["net-worth"] });
  qc.invalidateQueries({ queryKey: ["accounts"] });
  qc.invalidateQueries({ queryKey: ["spending"] });
  qc.invalidateQueries({ queryKey: ["debts"] });
  qc.invalidateQueries({ queryKey: ["transactions"] });
}

const TRANSACTIONS_PAGE = 100;

// Newest first, a page at a time ("Load more").
export function useTransactions(filters: { accountId?: string; search?: string }) {
  return useInfiniteQuery({
    queryKey: ["transactions", filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(TRANSACTIONS_PAGE), offset: String(pageParam) });
      if (filters.accountId) params.set("accountId", filters.accountId);
      if (filters.search) params.set("q", filters.search);
      return api.get<TransactionsResponse>(`/transactions?${params}`);
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.transactions.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
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
  creditLimit?: number | null;
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
    // Either or both, as the bank shows them today.
    mutationFn: ({ accountId, ...update }: { accountId: string; balance?: number; creditLimit?: number | null }) =>
      api.patch(`/accounts/${accountId}/balance`, update),
    onSuccess: () => invalidateAll(qc),
  });
}

// Edit bank / type / subtype (any subset).
export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      ...fields
    }: {
      accountId: string;
      institutionName?: string | null;
      type?: string;
      subtype?: string | null;
    }) => api.patch(`/accounts/${accountId}`, fields),
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
