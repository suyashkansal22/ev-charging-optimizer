import { LineChart, TrendingDown } from "lucide-react";

export function PriceForecastChart() {
  const dataPoints = [
    80, 75, 60, 50, 45, 30, 20, 15, 10, 15, 25, 40, 
    60, 85, 90, 80, 70, 55, 40, 30, 25, 20, 15, 10
  ];
  
  // Create SVG points
  const points = dataPoints.map((val, i) => {
    const x = (i / (dataPoints.length - 1)) * 100;
    const y = 100 - val; // Invert y because SVG y goes down
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LineChart className="text-slate-900" size={24} />
          <h2 className="text-sm font-semibold text-slate-950 uppercase tracking-wide">24h Price Forecast</h2>
        </div>
        <span className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
          <TrendingDown size={14} /> Prices dropping
        </span>
      </div>

      <div className="flex h-64 w-full mt-6">
        {/* Y-axis labels on the left */}
        <div className="flex flex-col justify-between text-[11px] text-slate-900 pr-3 pb-6 text-right w-12">
          <span>₹5.00</span>
          <span>₹3.50</span>
          <span>₹2.00</span>
          <span>₹0.00</span>
        </div>

        {/* Chart Area */}
        <div className="relative flex-1 ml-2">
          <div className="absolute inset-0 pb-6">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
              
              <defs>
                <linearGradient id="chartBg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f0fdf4" /> {/* Light green at top */}
                  <stop offset="100%" stopColor="#ffffff" /> {/* White at bottom */}
                </linearGradient>
              </defs>

              {/* Outer box border to match image, now with a subtle gradient fill */}
              <rect x="0" y="0" width="100" height="100" fill="url(#chartBg)" stroke="#0f172a" strokeWidth="0.5" />

              {/* Green Line Graph matching the image */}
              <polyline 
                points={points} 
                fill="none" 
                stroke="#16a34a" 
                strokeWidth="0.5" 
                strokeLinejoin="round" 
                strokeLinecap="round" 
              />

              {/* Visible Data Points & Hover Tooltips */}
              {dataPoints.map((val, i) => {
                const x = (i / (dataPoints.length - 1)) * 100;
                const y = 100 - val;
                const isHigh = val > 60;
                const priceColor = isHigh ? "#ef4444" : "#16a34a"; 

                return (
                  <g key={`dot-${i}`} className="group">
                    {/* Invisible larger target for hovering */}
                    <circle cx={x} cy={y} r="6" fill="transparent" className="cursor-pointer" />
                    
                    {/* Tiny dot that only appears on hover */}
                    <circle cx={x} cy={y} r="1" fill="#0f172a" className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    
                    {/* Hover Tooltip */}
                    <g className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <rect 
                        x={x > 80 ? x - 28 : x - 15} 
                        y={y > 20 ? y - 22 : y + 6} 
                        width="30" height="14" rx="2" 
                        fill="white" 
                        stroke="#e2e8f0"
                        strokeWidth="0.5"
                      />
                      <text 
                        x={x > 80 ? x - 13 : x} 
                        y={y > 20 ? y - 12 : y + 16} 
                        fill={priceColor} 
                        fontSize="6" 
                        textAnchor="middle" 
                        fontWeight="bold"
                      >
                        ₹{(val * 0.05).toFixed(2)}
                      </text>
                    </g>
                  </g>
                )
              })}
            </svg>
          </div>
          
          {/* X-axis labels at bottom */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between px-[2px] text-[11px] font-medium text-slate-900">
            <span>Now</span>
            <span>+6h</span>
            <span>+12h</span>
            <span>+18h</span>
            <span>+24h</span>
          </div>
        </div>
      </div>
    </div>
  );
}
