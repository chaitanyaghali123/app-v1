import { useState, useEffect } from "react";
import { subscribeOrder, fetchInvoices } from "../api";
import { Invoice } from "../types";

const SubscriptionForm: React.FC = () => {
  const [plan, setPlan] = useState("Basic");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);

  // ✅ Pull userId from localStorage (set during login/signup)
  const userId = localStorage.getItem("userId") || "anon";

  async function handleSubscribe() {
    setLoading(true);
    setError(null);
    try {
      // ✅ Send userId along with name/email/plan
      const res = await subscribeOrder({ userId, name, email, plan });
      alert(`Order created: ${res.orderId}`);
      const inv = await fetchInvoices();
      setInvoices(inv);
      setIsSubscribed(true);
    } catch (err: any) {
      setError(err.message || "Subscription failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const inv = await fetchInvoices();
        setInvoices(inv);
        if (inv.length > 0) {
          setIsSubscribed(true);
        }
      } catch {
        setInvoices([]);
      }
    })();
  }, []);

  return (
    <div style={{ padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <h2>Subscribe</h2>

      {/* Subscription Status */}
      <div style={{ marginBottom: 15 }}>
        <strong>Status:</strong>{" "}
        {isSubscribed ? (
          <span style={{ color: "green" }}>✅ Subscribed</span>
        ) : (
          <span style={{ color: "blue" }}>Upgrade to Plus</span>
        )}
      </div>

      {/* Form */}
      <div style={{ marginBottom: 10 }}>
        <label>
          Name:
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ marginLeft: 10 }}
          />
        </label>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label>
          Email:
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ marginLeft: 10 }}
          />
        </label>
      </div>
      <div style={{ marginBottom: 10 }}>
        <label>
          Plan:
          <select
            value={plan}
            onChange={e => setPlan(e.target.value)}
            style={{ marginLeft: 10 }}
          >
            <option value="Basic">Basic</option>
            <option value="Prime">Prime</option>
          </select>
        </label>
      </div>
      <button onClick={handleSubscribe} disabled={loading}>
        {loading ? "Processing..." : "Subscribe"}
      </button>

      {error && <p style={{ color: "red", marginTop: 10 }}>{error}</p>}

      {/* Invoice History */}
      <h3 style={{ marginTop: 20 }}>Invoice History</h3>
      {invoices.length === 0 ? (
        <p>No invoices yet.</p>
      ) : (
        <ul>
          {invoices.map(inv => (
            <li key={inv.id} style={{ marginBottom: 8 }}>
              <span style={{ fontWeight: "bold" }}>{inv.plan}</span> — ₹{inv.amount} —{" "}
              {new Date(inv.created_at).toLocaleDateString()} —{" "}
              <a href={inv.url} target="_blank" rel="noopener noreferrer">
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SubscriptionForm;
