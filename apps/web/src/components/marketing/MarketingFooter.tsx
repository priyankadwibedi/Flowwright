import Link from "next/link";
import { externalLinks, routes } from "../../lib/routes";

export function MarketingFooter() {
  return (
    <footer className="marketing-footer" id="about">
      <div className="app-container footer-inner">
        <div className="footer-brand">
          <div className="footer-wordmark">
            flowwright<span>®</span>
          </div>
          <p>Show the work. Ship the workflow.</p>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <Link href={routes.record}>Record</Link>
          <Link href={routes.demo}>Demo</Link>
          <Link href={routes.architecture}>Architecture</Link>
          <Link href={routes.tests}>Tests</Link>
          <a href={externalLinks.docs} target="_blank" rel="noreferrer">
            Documentation
          </a>
          <a href={externalLinks.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={externalLinks.security} target="_blank" rel="noreferrer">
            Security
          </a>
          <a href={externalLinks.license} target="_blank" rel="noreferrer">
            License
          </a>
        </nav>
        <div className="footer-meta">
          <span>Apache License 2.0</span>
          <span>Hackathon prototype</span>
        </div>
      </div>
    </footer>
  );
}
