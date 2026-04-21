// src/components/SignupForm.tsx

import React, { useState } from "react";
import { signupUser } from "../api";
import { useNavigate, Link } from "react-router-dom";

const SignupForm: React.FC = () => {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signupUser({ name, email, password, phone });

      // ✅ Save user email for sidebar account settings
      localStorage.setItem("userEmail", email);

      alert("Signup successful! Check your email.");
      navigate("/"); // redirect to Ask page
    } catch (err: any) {
      localStorage.removeItem("userEmail");
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ask-form-container">
      <h2>Create Account</h2>

      <form onSubmit={handleSignup} className="buttons" style={{ flexDirection: "column" }}>
        <input
          id="name"
          type="text"
          placeholder="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <input
          id="email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <input
          id="phone"
          type="tel"
          placeholder="Phone Number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Sign Up"}
        </button>

        {error && <p style={{ color: "red", marginTop: "10px" }}>{error}</p>}
      </form>

      {/* ✅ Optional: link to login */}
      <div style={{ marginTop: "15px", fontSize: "14px" }}>
        <span>Already have an account? </span>
        <Link to="/login" style={{ color: "#2563eb", textDecoration: "none" }}>
          Log in
        </Link>
      </div>
    </div>
  );
};

export default SignupForm;
