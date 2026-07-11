import { BatteryCharging, CheckCircle, Clock, ListChecks, PlugZap, Users } from "lucide-react";
import type { EventFeedItem } from "../hooks/useEventFeed";

type EventFeedPanelProps = {
  events: EventFeedItem[];
};

const eventIcon = {
  assignment: ListChecks,
  arrival: CheckCircle,
  charging: PlugZap,
  complete: BatteryCharging,
  queue: Users
};

const toneClass = {
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  green: "bg-green-50 text-green-700 ring-green-100",
  orange: "bg-orange-50 text-orange-700 ring-orange-100"
};

export function EventFeedPanel({ events }: EventFeedPanelProps) {
  return (
    <section className="mt-5 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Event Feed</h2>
          <p className="mt-0.5 text-xs text-slate-500">Latest simulation activity</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-100">
          <Clock size={12} aria-hidden="true" />
          Live
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {events.length > 0 ? (
          events.map((event) => {
            const Icon = eventIcon[event.type];

            return (
              <article
                key={event.id}
                className="rounded-lg border border-slate-100 bg-slate-50/80 p-3"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${toneClass[event.tone]}`}
                  >
                    <Icon size={16} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold leading-5 text-slate-900">
                        {event.title}
                      </h3>
                      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-100">
                        {event.timeLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{event.description}</p>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-lg bg-slate-50/80 p-3 text-sm text-slate-500">
            Waiting for simulation activity.
          </div>
        )}
      </div>
    </section>
  );
}
