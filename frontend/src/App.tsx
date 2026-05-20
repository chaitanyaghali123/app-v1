// App.tsx
import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import AskForm from "./components/AskForm";
import SignupForm from "./components/SignupForm";
import SubscriptionForm from "./components/SubscriptionForm";
import LoginForm from "./components/LoginForm";
import ProfileSettings from "./components/ProfileSettings"; // ✅ profile page
import { refreshToken } from "./api";
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
          localStorage.removeItem("userEmail");
          // ✅ Allow signup, subscribe, and profile without redirect
          if (
            currentPath !== "/signup" &&
            currentPath !== "/subscribe" &&
            currentPath !== "/profile"
          ) {
            navigate("/login");
          }
        }
      } else {
        // ✅ Allow signup, subscribe, and profile without forcing login
        if (
          currentPath !== "/signup" &&
          currentPath !== "/subscribe" &&
          currentPath !== "/profile"
        ) {
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

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AutoLogin />
      <Routes>
        <Route path="/" element={<AskForm />} />
        <Route path="/signup" element={<SignupForm />} />
        <Route path="/login" element={<LoginForm />} />
        <Route path="/subscribe" element={<SubscriptionForm />} /> {/* ✅ subscription */}
        <Route path="/profile" element={<ProfileSettings />} />   {/* ✅ profile */}
      </Routes>
    </BrowserRouter>
  );
};

export default App;