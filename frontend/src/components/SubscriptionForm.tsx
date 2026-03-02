import { useState, useEffect } from "react";
import { subscribeOrder, fetchInvoices } from "../api";
import { Invoice } from "../types";

const SubscriptionForm: React.FC = () => {
  const [plan, setPlan] = useState("Basic");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    setLoading(true);
    try {
      const res = await subscribeOrder({ name, email, plan });
      alert(`Order created: ${res.orderId}`);
      const inv = await fetchInvoices();
      setInvoices(inv);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const inv = await fetchInvoices();
        setInvoices(inv);
      } catch {
        setInvoices([]);
      }
    })();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Subscribe</h2>
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

      <h3 style={{ marginTop: 20 }}>Invoice History</h3>
      {invoices.length === 0 ? (
        <p>No invoices yet.</p>
      ) : (
        <ul>
          {invoices.map(inv => (
            <li key={inv.id}>
              {inv.plan} — ₹{inv.amount} —{" "}
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
