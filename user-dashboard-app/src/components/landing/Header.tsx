import { PlugZap } from "lucide-react";
import { Link } from "react-router-dom";

export function Header() {
  return (
    <header className="sticky top-0 z-[1000] w-full border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white shadow-sm">
            <PlugZap size={22} aria-hidden="true" />
          </div>
          <span className="text-xl font-semibold text-slate-950">EV Optimizer</span>
        </div>
        
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <a href="#features" className="hover:text-slate-950 transition-colors">Features</a>
          <a href="#benefits" className="hover:text-slate-950 transition-colors">Benefits</a>
          <a href="#about" className="hover:text-slate-950 transition-colors">About</a>
        </nav>

        <div className="flex items-center gap-4">
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 transition-all"
          >
            Launch Dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}
