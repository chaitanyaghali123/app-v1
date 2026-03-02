import { Kafka } from "kafkajs";

const broker = process.env.KAFKA_BROKER;

let kafkaProducer = null;
let kafkaConsumer = null;

if (broker) {
  const kafka = new Kafka({
    clientId: "invoice-app",
    brokers: [broker],
  });

  kafkaProducer = kafka.producer();
  kafkaConsumer = kafka.consumer({ groupId: "invoice-workers" });

  await kafkaProducer.connect();
  await kafkaConsumer.connect();
} else {
  console.log("Kafka disabled in this environment (no broker set)");
  // Provide safe stubs so your app doesn’t break
  kafkaProducer = { send: async () => {}, connect: async () => {}, disconnect: async () => {} };
  kafkaConsumer = { subscribe: async () => {}, run: async () => {}, connect: async () => {}, disconnect: async () => {} };
}

export { kafkaProducer, kafkaConsumer };
