import { Navigation, ShieldCheck, BarChart3 } from "lucide-react";

export function FeatureCards() {
  const features = [
    {
      name: "Dynamic Smart Routing",
      description: "Assigns vehicles to chargers based on predictive traffic, wait times, and current battery levels, eliminating congestion at peak hours.",
      icon: Navigation,
      accent: "bg-blue-50 text-blue-700 ring-blue-100",
    },
    {
      name: "Grid Load Balancing",
      description: "Monitors transformer capacities in real-time, automatically adjusting charging speeds to prevent grid overload and reduce peak demand charges.",
      icon: ShieldCheck,
      accent: "bg-green-50 text-green-700 ring-green-100",
    },
    {
      name: "Predictive Analytics",
      description: "Uses historical data to forecast pricing, demand, and grid strain up to 24 hours in advance, allowing for proactive fleet management.",
      icon: BarChart3,
      accent: "bg-orange-50 text-orange-700 ring-orange-100",
    },
  ];

  return (
    <section id="features" className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-sm font-semibold leading-7 text-green-700 uppercase tracking-wide">
            Intelligent Infrastructure
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
            Everything you need to manage your fleet
          </p>
          <p className="mt-6 text-lg leading-8 text-slate-600">
            Our platform connects directly to your vehicles and charging stations to optimize every watt of power and every minute of time.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.name} className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm shadow-slate-200/60 transition-all hover:shadow-md hover:border-slate-300/80">
                <dt className="flex items-center gap-x-3 text-lg font-semibold leading-7 text-slate-950">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${feature.accent}`}>
                    <feature.icon size={20} aria-hidden="true" />
                  </div>
                  {feature.name}
                </dt>
                <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-slate-600">
                  <p className="flex-auto">{feature.description}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
