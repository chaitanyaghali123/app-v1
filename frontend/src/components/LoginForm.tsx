import React, { useState } from "react";
import { loginUser } from "../api";
import { useNavigate, Link } from "react-router-dom";

const LoginForm: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { accessToken, refreshToken } = await loginUser({ email, password });

      // ✅ Save tokens
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("accessToken", accessToken);

      // ✅ Save user email for sidebar account settings
      localStorage.setItem("userEmail", email);

      alert("Login successful!");
      navigate("/"); // redirect to Ask page
    } catch (err: any) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("userEmail");
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ask-form-container">
      <h2>Login</h2>
      <form onSubmit={handleLogin}>
        <input
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

        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>

        {/* ✅ Forgot password link */}
        <div style={{ marginTop: "10px" }}>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>

        {error && <p className="error-message">{error}</p>}
      </form>

      {/* ✅ Optional: link to signup */}
      <div style={{ marginTop: "15px", fontSize: "14px" }}>
        <span>Don't have an account? </span>
        <Link to="/signup">Sign up</Link>
      </div>
    </div>
  );
};

export default LoginForm;
