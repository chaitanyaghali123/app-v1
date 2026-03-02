import React, { useState } from "react";
import { signupUser } from "../api";
import { useNavigate } from "react-router-dom";

const SignupForm: React.FC = () => {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signupUser({ name, email, password });
      alert("Signup successful! Check your email.");
      navigate("/"); // redirect to Ask page
    } catch (err: any) {
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

        <button type="submit">
          {loading ? "Creating..." : "Sign Up"}
        </button>

        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>
    </div>
  );
};

export default SignupForm;
