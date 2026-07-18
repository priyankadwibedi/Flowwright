"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { externalLinks, primaryNavItems, routes } from "../../lib/routes";

export function FlowwrightMark() {
  return (
    <svg className="flowwright-mark" viewBox="0 0 36 36" aria-hidden="true">
      <path d="M8 9h11M8 18h8M8 27h11M19 9v9h9M16 18l5 9h7" />
      <circle cx="8" cy="9" r="2.2" />
      <circle cx="8" cy="18" r="2.2" />
      <circle cx="8" cy="27" r="2.2" />
      <circle cx="28" cy="9" r="2.2" />
      <circle cx="28" cy="27" r="2.2" />
    </svg>
  );
}

export function MarketingHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="marketing-header">
      <div className="app-container marketing-header-inner">
        <Link className="brand" href={routes.home} onClick={() => setOpen(false)}>
          <FlowwrightMark />
          <span>flowwright</span>
        </Link>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={open}
          aria-controls="primary-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="sr-only">Toggle navigation</span>
          <span aria-hidden="true">{open ? "Close" : "Menu"}</span>
        </button>
        <nav
          id="primary-navigation"
          className={`primary-navigation${open ? " is-open" : ""}`}
          aria-label="Primary"
        >
          <div className="nav-center">
            {primaryNavItems.map(({ label, href, isActive }) => {
              const active = isActive(pathname);
              return (
                <Link
                  key={label}
                  href={href}
                  className={active ? "is-active" : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {label}
                </Link>
              );
            })}
          </div>
          <div className="nav-actions">
            <a href={externalLinks.github} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link
              className="button button-amber button-small"
              href={routes.record}
              onClick={() => setOpen(false)}
            >
              Try Flowwright <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
