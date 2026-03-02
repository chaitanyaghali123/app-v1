// Stubbed Razorpay service for local dev
export const razorpay = {
  orders: {
    create: async (opts) => ({
      id: `order_${Date.now()}`,
      amount: opts.amount,
      currency: opts.currency,
      notes: opts.notes,
    }),
  },
};
