// Generates abstract "plated dish" JPEGs for the dev-only demo mode.
// Usage: node scripts/make-demo-images.cjs   (requires sharp, which ships with Next)
const sharp = require("sharp");
const path = require("node:path");

const dishes = [
  { id: "ramen", table: "#3b2f2a", plate: "#e8e2d6", food: ["#d9a441", "#8a3b24", "#6c8a3a", "#f1ead8"] },
  { id: "tacos", table: "#2d3b47", plate: "#d8cdb8", food: ["#c9552b", "#7a9a3c", "#e9c46a", "#f2e8cf"] },
  { id: "salad", table: "#e5dccb", plate: "#fbfaf5", food: ["#5f8f3a", "#b5332c", "#e8c547", "#9ec36b"] },
  { id: "pasta", table: "#40302b", plate: "#f3eee3", food: ["#d4a017", "#b23a2a", "#e9d8a6", "#5b7f2b"] },
  { id: "curry", table: "#2a2f36", plate: "#cfc6b4", food: ["#c4671f", "#e2a53a", "#7c3b1a", "#f4efe3"] },
  { id: "pancakes", table: "#cdbfa8", plate: "#ffffff", food: ["#c88a3d", "#e6b768", "#8c2f2f", "#f5e9d3"] },
  { id: "soup", table: "#394238", plate: "#ece5d6", food: ["#c9772b", "#8aa14a", "#f0d28a", "#a8442f"] },
  { id: "toast", table: "#46372d", plate: "#e7dfcf", food: ["#d9b36c", "#6f8e3a", "#c14a32", "#f3ead6"] },
];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

async function main() {
  for (const [i, d] of dishes.entries()) {
    const r = rng(i * 7919 + 13);
    const W = 800, H = 1000, cx = W / 2, cy = H / 2 - 20;
    let blobs = "";
    for (let k = 0; k < 26; k++) {
      const a = r() * Math.PI * 2, dist = Math.sqrt(r()) * 215;
      const x = cx + Math.cos(a) * dist, y = cy + Math.sin(a) * dist;
      blobs += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(18 + r() * 44).toFixed(1)}" ry="${(14 + r() * 36).toFixed(1)}" fill="${d.food[Math.floor(r() * d.food.length)]}" opacity="${(0.75 + r() * 0.25).toFixed(2)}" transform="rotate(${(r() * 180).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs><radialGradient id="g" cx="50%" cy="40%" r="80%"><stop offset="0" stop-color="${d.table}" stop-opacity="0.85"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>
      <filter id="s"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-opacity=".4"/></filter></defs>
      <rect width="100%" height="100%" fill="${d.table}"/><rect width="100%" height="100%" fill="url(#g)"/>
      <circle cx="${cx}" cy="${cy}" r="300" fill="${d.plate}" filter="url(#s)"/>
      <circle cx="${cx}" cy="${cy}" r="248" fill="none" stroke="#000" stroke-opacity=".08" stroke-width="3"/>
      ${blobs}</svg>`;
    const out = path.join(__dirname, "demo");
    await sharp(Buffer.from(svg)).jpeg({ quality: 78 }).toFile(path.join(out, `${d.id}.jpg`));
    await sharp(Buffer.from(svg)).resize(400, 500).jpeg({ quality: 70 }).toFile(path.join(out, `${d.id}.thumb.jpg`));
  }
  console.log("wrote", dishes.length, "demo images");
}
main();
