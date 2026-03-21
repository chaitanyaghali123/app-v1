import { Kafka } from "kafkajs";

// Configure Kafka client
const kafka = new Kafka({
  clientId: "invoice-app",
  brokers: [process.env.KAFKA_BROKER || "kafka:9092"],
});

// Producer and Consumer instances
export const kafkaProducer = kafka.producer();
export const kafkaConsumer = kafka.consumer({ groupId: "invoice-worker" });

// Connect producer
export async function connectProducer() {
  try {
    await kafkaProducer.connect();
    console.log("✅ Kafka producer connected");
  } catch (err) {
    console.error("❌ Kafka producer connection failed:", err.message);
  }
}

// Connect consumer
export async function connectConsumer(topic, handler) {
  try {
    await kafkaConsumer.connect();
    await kafkaConsumer.subscribe({ topic, fromBeginning: true });

    await kafkaConsumer.run({
      eachMessage: async ({ message }) => {
        const value = message.value.toString();
        console.log(`📥 Received message from ${topic}:`, value);
        if (handler) handler(JSON.parse(value));
      },
    });

    console.log(`✅ Kafka consumer subscribed to ${topic}`);
  } catch (err) {
    console.error("❌ Kafka consumer connection failed:", err.message);
  }
}

// Send message
export async function sendMessage(topic, message) {
  try {
    await kafkaProducer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
    console.log(`📤 Sent message to ${topic}:`, message);
  } catch (err) {
    console.error("❌ Failed to send message:", err.message);
  }
}

// Graceful shutdown
export async function disconnectKafka() {
  await kafkaProducer.disconnect();
  await kafkaConsumer.disconnect();
  console.log("🛑 Kafka disconnected");
}
