import Link from "next/link";
import type { AppRoute } from "../../lib/routes";

type BackLinkProps = {
  href: AppRoute | string;
  label: string;
};

export function BackLink({ href, label }: BackLinkProps) {
  return (
    <Link className="back-link" href={href} aria-label={label}>
      <span className="back-link-icon" aria-hidden="true">
        ←
      </span>
      <span>{label}</span>
    </Link>
  );
}
