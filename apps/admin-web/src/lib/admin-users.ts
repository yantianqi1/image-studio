export type AdminUser = Readonly<{
  id: number;
  email: string;
  display_name: string;
  status: string;
  created_at: string;
}>;

export type AdminUserList = Readonly<{
  items: readonly AdminUser[];
  total: number;
  page: number;
  page_size: number;
}>;

export type AdminUsersQuery = Readonly<{
  q?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}>;

export function buildUsersSearch(query: AdminUsersQuery) {
  const params = new URLSearchParams();
  appendSearchParam(params, "q", query.q);
  appendSearchParam(params, "status", query.status);
  appendNumberParam(params, "page", query.page);
  appendNumberParam(params, "page_size", query.pageSize);
  const search = params.toString();
  return search ? `?${search}` : "";
}

function appendSearchParam(params: URLSearchParams, key: string, value?: string) {
  if (value?.trim()) {
    params.set(key, value.trim());
  }
}

function appendNumberParam(params: URLSearchParams, key: string, value?: number) {
  if (typeof value === "number") {
    params.set(key, String(value));
  }
}
