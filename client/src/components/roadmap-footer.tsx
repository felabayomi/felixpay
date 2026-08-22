import { Link } from "wouter";

export function RoadmapFooter() {
  const scrollTop = () => window.scrollTo(0, 0);

  return (
    <footer className="border-t border-border bg-muted/30" data-testid="footer">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className="text-xs text-muted-foreground">
              Public Financial Readiness Assessment
            </p>
            <p className="text-xs text-muted-foreground">
              &copy; 2026 Debt to Legacy LLC. All rights reserved.
            </p>
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              No reproduction, redistribution, or commercial use permitted without written authorization.
            </p>
          </div>
          <nav className="flex items-center gap-4 flex-wrap justify-center" data-testid="nav-footer-links">
            <Link href="/about" onClick={scrollTop} className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-about">
              About
            </Link>
            <Link href="/privacy-policy" onClick={scrollTop} className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-privacy">
              Privacy
            </Link>
            <Link href="/terms-of-use" onClick={scrollTop} className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-terms">
              Terms
            </Link>
            <Link href="/privacy-policy" onClick={scrollTop} className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-data-usage">
              Data Usage
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

