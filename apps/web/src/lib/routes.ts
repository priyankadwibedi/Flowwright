/**
 * Central route paths for the Next.js app.
 * Use with next/link — basePath (e.g. /Flowwright on GitHub Pages) is applied automatically.
 */
export const routes = {
  home: "/",
  record: "/record",
  architecture: "/architecture",
  demo: "/workflows/demo",
  inferred: "/workflows/inferred",
  code: "/code",
  tests: "/tests",
  generatedInvoice: "/generated/invoice-processor",
  product: "/#product",
  process: "/#process",
  about: "/#about",
} as const;

export type AppRoute = (typeof routes)[keyof typeof routes];

export const externalLinks = {
  github: "https://github.com/priyankadwibedi/Flowwright",
  docs: "https://github.com/priyankadwibedi/Flowwright/tree/main/docs",
  security: "https://github.com/priyankadwibedi/Flowwright/blob/main/SECURITY.md",
  license: "https://github.com/priyankadwibedi/Flowwright/blob/main/LICENSE",
} as const;

export type PrimaryNavItem = {
  label: string;
  href: string;
  isActive: (pathname: string) => boolean;
};

export const primaryNavItems: PrimaryNavItem[] = [
  {
    label: "Product",
    href: routes.product,
    isActive: (pathname) => pathname === routes.home,
  },
  {
    label: "How it works",
    href: routes.process,
    isActive: () => false,
  },
  {
    label: "Architecture",
    href: routes.architecture,
    isActive: (pathname) =>
      pathname === routes.architecture ||
      pathname === `${routes.architecture}/`,
  },
  {
    label: "Demo",
    href: routes.demo,
    isActive: (pathname) =>
      pathname === routes.demo || pathname === `${routes.demo}/`,
  },
  {
    label: "About",
    href: routes.about,
    isActive: () => false,
  },
];
