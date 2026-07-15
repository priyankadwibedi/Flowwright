import type { ReactNode } from "react";

type ProductPreviewTileProps = {
  eyebrow: string;
  title: string;
  tone?: "light" | "dark" | "amber" | "teal";
  children: ReactNode;
  className?: string;
};

export function ProductPreviewTile({
  eyebrow,
  title,
  tone = "light",
  children,
  className = "",
}: ProductPreviewTileProps) {
  return (
    <article
      className={`preview-tile preview-tile-${tone} ${className}`}
      aria-hidden="true"
    >
      <div className="preview-tile-heading">
        <span className="mono-label">{eyebrow}</span>
        <span className="preview-dot" />
      </div>
      <h3>{title}</h3>
      <div className="preview-content">{children}</div>
    </article>
  );
}
