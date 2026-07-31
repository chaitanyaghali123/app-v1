const path = require('path');
const fs = require('fs');
// Find the services directory
const servicesDir = '/app/services';
const dbService = require(path.join(servicesDir, 'db.service.js'));
const geminiService = require(path.join(servicesDir, 'gemini.service.js'));

async function main() {
  const record = await dbService.getGeminiKeyRecord('34fca381-3c03-9a98-01fa-2ecfd3ba9318');
  if (!record) { console.log('No record found'); return; }
  console.log('Record found, version:', record.encryption_version);
  try {
    const key = await geminiService.decryptGeminiApiKeyRecord(record);
    console.log('Decrypted key starts with:', key.substring(0, 10) + '...');
    // Test the key
    const start = Date.now();
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }], generationConfig: { temperature: 0, maxOutputTokens: 16 } })
    });
    console.log('Status:', resp.status, resp.statusText);
    const body = await resp.text();
    console.log('Body:', body.substring(0, 300));
    console.log('Latency:', Date.now() - start, 'ms');
  } catch (e) {
    console.log('Error:', e.constructor.name, e.message);
    console.log('Stack:', e.stack?.substring(0, 300));
  }
}
main().catch(e => console.log(e.message));
