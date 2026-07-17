import { PlugZap } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200/80">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-600 text-white shadow-sm">
              <PlugZap size={18} aria-hidden="true" />
            </div>
            <span className="text-lg font-semibold text-slate-950">EV Optimizer</span>
          </div>
          <p className="text-sm leading-5 text-slate-500">
            &copy; {new Date().getFullYear()} EV Optimizer, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
