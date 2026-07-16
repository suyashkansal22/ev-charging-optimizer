import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import LandingPage from "./pages/LandingPage";
import UserDashboardPage from "./pages/UserDashboardPage";
import UserNavigationPage from "./pages/UserNavigationPage";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/user" element={<UserDashboardPage />} />
        <Route path="/user/navigate/:vehicleId/:stationId" element={<UserNavigationPage />} />
      </Routes>
    </Router>
  );
}
