const fs = require("fs");
const path = "D:\\dist2\\index.html";
const idx = fs.readFileSync(path, "utf8");
console.log("=== index.html references (all src/href lines) ===");
for (const line of idx.split("\n")) {
  const t = line.trim();
  if (/src=|href=|\.js|\.css|_expo|static\/js/.test(t)) console.log("  " + t.slice(0, 160));
}
console.log("\n=== does dist2 hold the referenced bundle (root + nested)? ===");
const re = /(?:src|href)="([^"]+\.js)"/g;
let m;
while ((m = re.exec(idx))) {
  const ref = m[1].replace(/^\//, "");
  const rootP = "D:\\dist2\\" + ref;
  const nestedP = "D:\\dist2\\_expo\\static\\js\\web\\" + ref.split("/").pop();
  console.log("  ref=%-55s root_exists=%s nested_exists=%s", ref, fs.existsSync(rootP), fs.existsSync(nestedP));
}

// fetch all candidate bundles that exist, stdout the biggest with marker report
const http = require("http");
const get = (u) =>
  new Promise((res, rej) => {
    http
      .get(u, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => res({ status: r.statusCode, body: d }));
      })
      .on("error", rej);
  });

(async () => {
  const home = await get("http://localhost:3000/");
  console.log("\n=== SERVED home=%d bytes, status=%d ===", home.body.length, home.status);
  const re2 = /(?:src|href)="([^"]+\.js)"/g;
  let m2, any = false;
  while ((m2 = re2.exec(home.body))) {
    any = true;
    const ref = m2[1];
    const url = ref.startsWith("http") ? ref : "http://localhost:3000/" + ref.replace(/^\//, "");
    const b = await get(url);
    console.log("  served ref=%-60s status=%d bytes=%d", ref, b.status, b.body.length);
  }
  if (!any) {
    console.log("  !! served home has NO .js reference at all — raw first 300 bytes:");
    console.log("  " + JSON.stringify(home.body.slice(0, 300)));
  }
})();
