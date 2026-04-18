import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import AskForm from "./components/AskForm";
import SignupForm from "./components/SignupForm";
import SubscriptionForm from "./components/SubscriptionForm";
import LoginForm from "./components/LoginForm";
import { refreshToken } from "./api";
import LogoutButton from "./components/LogoutButton";
import "./App.css";

const AutoLogin: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const refresh = async () => {
      const storedRefresh = localStorage.getItem("refreshToken");
      const currentPath = window.location.pathname;

      if (storedRefresh) {
        try {
          const { accessToken } = await refreshToken(storedRefresh);
          localStorage.setItem("accessToken", accessToken);
          console.log("Auto-login successful");
        } catch {
          console.log("Refresh failed, redirecting to login");
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          // ✅ Only redirect if not on signup or subscribe
          if (currentPath !== "/signup" && currentPath !== "/subscribe") {
            navigate("/login");
          }
        }
      } else {
        // ✅ Allow signup/subscribe without forcing login
        if (currentPath !== "/signup" && currentPath !== "/subscribe") {
          navigate("/login");
        }
      }
      setLoading(false);
    };
    refresh();
  }, [navigate]);

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }
  return null;
};

const Navbar: React.FC = () => (
  <nav className="navbar">
    <div className="nav-links">
      <Link to="/">Ask</Link>
      <Link to="/signup">Signup</Link>
      <Link to="/subscribe">Subscription</Link>
      <LogoutButton />
    </div>
  </nav>
);

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AutoLogin />
      <Navbar />
      <Routes>
        <Route path="/" element={<AskForm />} />
        <Route path="/signup" element={<SignupForm />} />
        <Route path="/login" element={<LoginForm />} />
        <Route path="/subscribe" element={<SubscriptionForm />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
