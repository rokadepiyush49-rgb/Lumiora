import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function Disclaimer() {
  return (
    <footer className="mt-auto border-t border-line px-4 py-3 md:px-6">
      <p className="max-w-4xl text-[10.5px] leading-relaxed text-faint">
        <span className="t-mono mr-2 tracking-[0.12em] text-dim">RESEARCH PROTOTYPE</span>
        Research prototype for educational and experimental use. Model outputs are not medical diagnoses and should not be used as a substitute for qualified clinical evaluation.
      </p>
    </footer>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-teal focus:px-3 focus:py-1.5 focus:text-[12px] focus:text-black">
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
        <Disclaimer />
      </div>
    </div>
  );
}
