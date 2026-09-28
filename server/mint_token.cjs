const fs = require("fs");
const jwt = require("jsonwebtoken");
const env = fs.readFileSync("/app/.env", "utf8");
const secret = (env.match(/^JWT_SECRET=(.+)$/m) || [])[1];
if (!secret) { console.error("no JWT_SECRET"); process.exit(1); }
const token = jwt.sign({ userId: "tester", email: "chaitanyaghali71@gmail.com", role: "user" }, secret, { expiresIn: "1h" });
console.log(token);