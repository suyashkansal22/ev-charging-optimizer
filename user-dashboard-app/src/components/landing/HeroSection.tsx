import { ArrowRight, Zap, Activity, BatteryCharging } from "lucide-react";
import { Link } from "react-router-dom";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-slate-50 pt-24 pb-32 sm:pt-32 sm:pb-40">
      {/* Background decorations */}
      <div className="absolute left-1/2 top-0 -z-10 -translate-x-1/2 blur-3xl xl:-top-6" aria-hidden="true">
        <div
          className="aspect-[1155/678] w-[72.1875rem] bg-gradient-to-tr from-[#86efac] to-[#3b82f6] opacity-20"
          style={{
            clipPath:
              'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700 ring-1 ring-green-100">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              System v2.0 is Live
            </span>
          </div>
          
          <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-6xl mb-6">
            Intelligent routing for modern EV fleets.
          </h1>
          <p className="text-lg leading-8 text-slate-600 mb-10">
            Optimize your EV charging infrastructure, reduce wait times, and perfectly balance grid load across your entire network in real-time.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/dashboard"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-green-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 transition-all"
            >
              Open Dashboard <ArrowRight size={18} />
            </Link>
            <a
              href="#features"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-base font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 transition-all"
            >
              Learn more
            </a>
          </div>
        </div>

        {/* Dashboard Preview Mockup */}
        <div className="mt-16 sm:mt-24 lg:mt-32">
          <div className="relative mx-auto max-w-5xl">
            <div className="rounded-2xl border border-white/80 bg-white/40 p-2 shadow-panel backdrop-blur sm:p-4">
              <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50">
                <div className="flex items-center gap-4 border-b border-slate-200/80 bg-white px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-slate-300" />
                    <div className="h-3 w-3 rounded-full bg-slate-300" />
                    <div className="h-3 w-3 rounded-full bg-slate-300" />
                  </div>
                  <div className="flex-1 text-center">
                    <span className="rounded-md bg-slate-100 px-3 py-1 text-xs text-slate-500">
                      ev-charging-optimizer.local
                    </span>
                  </div>
                </div>
                {/* Mockup Dashboard Content */}
                <div className="h-[400px] w-full bg-[url('https://maps.wikimedia.org/osm-intl/12/1208/1539.png')] bg-cover bg-center opacity-60 flex items-center justify-center relative">
                  <div className="absolute inset-0 bg-slate-50/50 backdrop-blur-sm" />
                  <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 p-6 w-full max-w-4xl">
                    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/60">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100 mb-4">
                        <Activity size={20} />
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Fleet</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-950">142</div>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/60">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-700 ring-1 ring-green-100 mb-4">
                        <Zap size={20} />
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grid Load</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-950">68%</div>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/60">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-700 ring-1 ring-orange-100 mb-4">
                        <BatteryCharging size={20} />
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Wait Times</div>
                      <div className="mt-1 text-2xl font-semibold text-slate-950">14 min</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
