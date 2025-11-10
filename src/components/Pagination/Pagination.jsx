// src/components/Pagination/Pagination.jsx
// Minimal, reusable paginator with windowed page numbers.

import Button from '@/components/Button/Button';

function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function getWindow(current, totalPages, windowSize = 5) {
  if (totalPages <= windowSize) return range(1, totalPages);
  const half = Math.floor(windowSize / 2);
  let start = Math.max(1, current - half);
  let end = Math.min(totalPages, start + windowSize - 1);
  if (end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);
  return range(start, end);
}

const Pagination = ({ page, total, limit, onChange }) => {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  const windowPages = getWindow(page, totalPages, 7);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button
        label="Prev"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      />
      {windowPages[0] > 1 && (
        <>
          <Button label="1" onClick={() => onChange(1)} />
          <span className="px-1">…</span>
        </>
      )}
      {windowPages.map((p) => (
        <Button
          key={p}
          label={String(p)}
          onClick={() => onChange(p)}
          disabled={p === page}
        />
      ))}
      {windowPages[windowPages.length - 1] < totalPages && (
        <>
          <span className="px-1">…</span>
          <Button label={String(totalPages)} onClick={() => onChange(totalPages)} />
        </>
      )}
      <Button
        label="Next"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
      />
    </div>
  );
};

export default Pagination;