import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
      <p className="t-mono text-[11px] tracking-[0.2em] text-dim">404 · NO SUCH VIEW</p>
      <p className="text-[14px] text-muted-foreground">The requested workstation view does not exist.</p>
      <Link href="/" className="t-mono text-[11px] text-teal hover:underline">
        ← Return to overview
      </Link>
    </div>
  );
}
