import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: "invoice-app",
  brokers: [process.env.KAFKA_BROKER || "kafka:9092"]
});

export const kafkaProducer = kafka.producer();
export const kafkaConsumer = kafka.consumer({ groupId: "invoice-workers" });

await kafkaProducer.connect();
await kafkaConsumer.connect();
