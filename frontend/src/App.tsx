import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";
import AskForm from "./components/AskForm";
import SignupForm from "./components/SignupForm";
import SubscriptionForm from "./components/SubscriptionForm";
import LoginForm from "./components/LoginForm";
import { refreshToken } from "./api";
import LogoutButton from "./components/LogoutButton"; // ✅ import

const AutoLogin: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const refresh = async () => {
      const storedRefresh = localStorage.getItem("refreshToken");
      if (storedRefresh) {
        try {
          const { accessToken } = await refreshToken(storedRefresh);
          localStorage.setItem("accessToken", accessToken);
          console.log("Auto-login successful");
        } catch {
          console.log("Refresh failed, redirecting to login");
          navigate("/login");
        }
      } else {
        navigate("/login");
      }
    };
    refresh();
  }, [navigate]);

  return null; // invisible component that runs on app load
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AutoLogin />
      <div style={{ textAlign: "right", padding: 20 }}>
        <Link to="/" style={{ marginRight: 15 }}>Ask</Link>
        <Link to="/signup" style={{ marginRight: 15 }}>Signup</Link>
        <Link to="/login" style={{ marginRight: 15 }}>Login</Link>
        <Link to="/subscribe" style={{ marginRight: 15 }}>Subscription</Link>
        <LogoutButton /> {/* ✅ new logout button */}
      </div>
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
