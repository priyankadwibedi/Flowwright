import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="marketing-footer" id="about">
      <div className="content-width footer-inner">
        <div>
          <div className="footer-wordmark">
            flowwright<span>®</span>
          </div>
          <p>Show the work. Ship the workflow.</p>
        </div>
        <div className="footer-links">
          <Link href="/record">Record</Link>
          <Link href="/workflows/demo">Demo</Link>
          <Link href="/tests">Tests</Link>
          <a
            href="https://github.com/priyankadwibedi/Flowwright/tree/main/docs"
            target="_blank"
            rel="noreferrer"
          >
            Docs
          </a>
        </div>
        <div className="footer-meta">
          <span>Apache License 2.0</span>
          <span>Hackathon prototype</span>
        </div>
      </div>
    </footer>
  );
}
