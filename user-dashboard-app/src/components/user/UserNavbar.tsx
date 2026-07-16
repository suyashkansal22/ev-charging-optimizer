import { Bell, User, Zap, Menu, X, Leaf, Navigation, ZapIcon, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { mockVehicles } from "../../mockData";

export function UserNavbar({ 
  selectedVehicleId = "Tesla EV3", 
  onVehicleChange 
}: { 
  selectedVehicleId?: string; 
  onVehicleChange?: (id: string) => void; 
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isCarDropdownOpen, setIsCarDropdownOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-[1000] w-full border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white shadow-sm">
              <Zap size={20} aria-hidden="true" />
            </div>
            <span className="text-xl font-semibold text-slate-950">EV Optimizer</span>
          </Link>
        </div>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-6">
          
          {/* Vehicle Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setIsCarDropdownOpen(!isCarDropdownOpen)}
              className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              <div className="h-2 w-2 rounded-full bg-green-500" />
              {selectedVehicleId}
            </button>

            {isCarDropdownOpen && (
              <div className="absolute top-full mt-2 right-0 w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-slate-900/5 focus:outline-none overflow-hidden z-50">
                <div className="space-y-1">
                  {mockVehicles.map((vehicle) => (
                    <button 
                      key={vehicle.vehicle_id}
                      onClick={() => { 
                        if (onVehicleChange) onVehicleChange(vehicle.vehicle_id); 
                        setIsCarDropdownOpen(false); 
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${selectedVehicleId === vehicle.vehicle_id ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      {vehicle.vehicle_id}
                    </button>
                  ))}
                </div>
                
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    + Add New Vehicle
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              <Bell size={20} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
            </button>

            {isNotificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-slate-900/5 focus:outline-none overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                  <button className="text-xs text-blue-600 hover:text-blue-700 font-medium">Mark all as read</button>
                </div>
                
                <div className="max-h-[300px] overflow-y-auto">
                  <div className="flex gap-3 px-4 py-3 border-b border-slate-100 bg-blue-50/50 hover:bg-slate-50 transition-colors">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 mt-0.5">
                      <ZapIcon size={14} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">Price Drop Alert</p>
                      <p className="text-xs text-slate-600 mt-0.5">Prices at Charging Station Sector 5 are dropping to ₹3.80/kWh in the next hour. Great time to charge!</p>
                      <p className="text-[10px] text-slate-400 mt-1">10 min ago</p>
                    </div>
                  </div>
                </div>
                
                <div className="border-t border-slate-100 p-2">
                  <button className="w-full rounded-md py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                    View All Notifications
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* Profile Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-600 hover:text-slate-900 ring-1 ring-slate-200 hover:ring-slate-300 transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              <User size={18} />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-slate-900/5 focus:outline-none">
                <div className="px-3 py-2 border-b border-slate-100 mb-2">
                  <p className="text-sm font-semibold text-slate-900">John Doe</p>
                  <p className="text-xs text-slate-500">john@example.com</p>
                </div>
                
                <div className="px-3 py-2 space-y-5 max-h-[60vh] overflow-y-auto">
                  
                  {/* Preferred Charging Time */}
                  <div>
                    <p className="text-xs font-semibold text-slate-900 mb-2">Preferred Charging Time</p>
                    <div className="grid grid-cols-2 gap-2">
                      {['Morning', 'Afternoon', 'Evening', 'Night'].map(time => (
                        <label key={time} className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer hover:text-slate-900">
                          <input type="checkbox" defaultChecked className="rounded border-slate-300 text-green-600 focus:ring-green-500 w-3.5 h-3.5 cursor-pointer" />
                          {time}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Sliders */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-900">Maximum Waiting Time</span>
                        <span className="font-medium text-green-600">20 mins</span>
                      </div>
                      <input type="range" min="0" max="60" defaultValue="20" className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-600" />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-900">Min Battery Alert</span>
                        <span className="font-medium text-green-600">25%</span>
                      </div>
                      <input type="range" min="0" max="100" defaultValue="25" className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-600" />
                    </div>
                  </div>

                  {/* Settings Toggles */}
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    {[
                      { label: "Always choose cheapest option" },
                      { label: "Prefer Fast Charging" },
                      { label: "Avoid Peak Hours" }
                    ].map(setting => (
                      <label key={setting.label} className="flex items-center justify-between cursor-pointer group">
                        <span className="text-xs font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">{setting.label}</span>
                        <div className="relative inline-flex items-center">
                          <input type="checkbox" defaultChecked className="sr-only peer" />
                          <div className="w-8 h-4.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-3.5 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-green-500"></div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="mt-2 border-t border-slate-100 pt-2 space-y-0.5">
                  <button className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors font-medium">Privacy Policy</button>
                  <button className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors font-medium">Terms & Conditions</button>
                  <button className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors font-medium">Help Center</button>
                  
                  <div className="pt-1 mt-1 border-t border-slate-50">
                    <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 font-medium transition-colors">
                      <LogOut size={16} /> Logout
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center">
          <button 
            className="p-2 text-slate-400 hover:text-slate-900"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200/80 bg-white shadow-lg pb-4">
          <div className="px-4 py-4 border-b border-slate-100 mb-2">
             <p className="text-sm font-semibold text-slate-900">John Doe</p>
             <p className="text-xs text-slate-500">john@example.com</p>
          </div>
          <div className="space-y-4 px-4 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">Connected Vehicle</span>
              <span className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                {selectedVehicleId}
              </span>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 font-medium transition-colors ring-1 ring-red-200">
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
