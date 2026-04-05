/**
 * Reusable server-side pagination component.
 * Renders as plain `<a>` tags — works in server components with no JS required.
 */

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  baseUrl: string;
};

function buildPageUrl(baseUrl: string, page: number): string {
  const url = new URL(baseUrl, 'http://localhost');
  url.searchParams.set('page', String(page));
  return `${url.pathname}${url.search}`;
}

function getPageNumbers(currentPage: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | '...')[] = [1];

  if (currentPage > 3) {
    pages.push('...');
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (currentPage < totalPages - 2) {
    pages.push('...');
  }

  pages.push(totalPages);

  return pages;
}

export default function Pagination({ currentPage, totalPages, baseUrl }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div className="flex items-center justify-center gap-1 pt-4">
      {/* Previous */}
      {currentPage > 1 ? (
        <a
          href={buildPageUrl(baseUrl, currentPage - 1)}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          ← Prev
        </a>
      ) : (
        <span className="px-3 py-1.5 text-sm font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-lg cursor-not-allowed">
          ← Prev
        </span>
      )}

      {/* Page numbers */}
      {pages.map((page, idx) =>
        page === '...' ? (
          <span key={`ellipsis-${idx}`} className="px-2 py-1.5 text-sm text-gray-400">
            …
          </span>
        ) : (
          <a
            key={page}
            href={buildPageUrl(baseUrl, page)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition ${
              page === currentPage
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {page}
          </a>
        )
      )}

      {/* Next */}
      {currentPage < totalPages ? (
        <a
          href={buildPageUrl(baseUrl, currentPage + 1)}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          Next →
        </a>
      ) : (
        <span className="px-3 py-1.5 text-sm font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-lg cursor-not-allowed">
          Next →
        </span>
      )}
    </div>
  );
}
