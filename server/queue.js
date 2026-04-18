import { Queue } from 'bullmq';

export const llmQueue = new Queue('llm-queue', {
  connection: {
    host: 'redis',
    port: 6379
  }
});