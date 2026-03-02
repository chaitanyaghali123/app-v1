import { Kafka } from "kafkajs";

const broker = process.env.KAFKA_BROKER;

let kafkaProducer;
let kafkaConsumer;

if (broker && broker !== "stub") {
  const kafka = new Kafka({
    clientId: "invoice-app",
    brokers: [broker], // must be host:port
  });

  kafkaProducer = kafka.producer();
  kafkaConsumer = kafka.consumer({ groupId: "invoice-workers" });

  await kafkaProducer.connect();
  await kafkaConsumer.connect();
} else {
  console.log("Kafka disabled in this environment (no broker set or stub)");

  // Provide safe stubs so your app doesn’t break
  kafkaProducer = {
    send: async () => console.log("[Kafka Stub] send skipped"),
    connect: async () => {},
    disconnect: async () => {},
  };
  kafkaConsumer = {
    subscribe: async () => console.log("[Kafka Stub] subscribe skipped"),
    run: async () => {},
    connect: async () => {},
    disconnect: async () => {},
  };
}

export { kafkaProducer, kafkaConsumer };
