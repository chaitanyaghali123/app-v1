import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import AskForm from "./components/AskForm";
import SignupForm from "./components/SignupForm";
import SubscriptionForm from "./components/SubscriptionForm"; // ✅ import

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div style={{ textAlign: "right", padding: 20 }}>
        <Link to="/" style={{ marginRight: 15 }}>Ask</Link>
        <Link to="/signup" style={{ marginRight: 15 }}>Signup</Link>
        <Link to="/subscribe">Subscription</Link> {/* ✅ new nav link */}
      </div>

      <Routes>
        <Route path="/" element={<AskForm />} />
        <Route path="/signup" element={<SignupForm />} />
        <Route path="/subscribe" element={<SubscriptionForm />} /> {/* ✅ new route */}
      </Routes>
    </BrowserRouter>
  );
};

export default App;
