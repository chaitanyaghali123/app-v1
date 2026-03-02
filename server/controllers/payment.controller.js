export async function createOrder(req, res) {
  const { name, email, plan } = req.body;
  const amount = plan === "Prime" ? 99900 : 49900;

  res.json({
    orderId: `order_${Date.now()}`,
    key: "rzp_test_stub",
    amount,
    currency: "INR",
  });
}