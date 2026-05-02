const FIRST_PAGE = 1;

export function PaginationControls({
  loading,
  page,
  pageSize,
  total,
  onPageChange,
}: Readonly<{
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}>) {
  const totalPages = Math.max(FIRST_PAGE, Math.ceil(total / pageSize));
  return (
    <div className="users-pagination">
      <span>
        第 {page} / {totalPages} 页，每页 {pageSize}
      </span>
      <div className="users-pagination-actions">
        <button className="admin-button users-secondary-button" type="button" disabled={loading || page <= FIRST_PAGE} onClick={() => onPageChange(page - FIRST_PAGE)}>
          上一页
        </button>
        <button className="admin-button users-secondary-button" type="button" disabled={loading || page >= totalPages} onClick={() => onPageChange(page + FIRST_PAGE)}>
          下一页
        </button>
      </div>
    </div>
  );
}
