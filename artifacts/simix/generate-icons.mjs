import sharp from "sharp";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, "public/favicon.svg");
const outDir = resolve(__dirname, "public/icons");

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const svgBuffer = readFileSync(svgPath);

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];

async function generateIcon(size, suffix = "") {
  const filename = `icon-${size}x${size}${suffix}.png`;
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(resolve(outDir, filename));
  console.log(`✔ ${filename}`);
}

async function generateMaskable(size) {
  const padding = Math.round(size * 0.1);
  const innerSize = size - padding * 2;
  const inner = await sharp(svgBuffer).resize(innerSize, innerSize).png().toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 91, g: 33, b: 182, alpha: 1 },
    },
  })
    .composite([{ input: inner, gravity: "center" }])
    .png()
    .toFile(resolve(outDir, `icon-${size}x${size}-maskable.png`));
  console.log(`✔ icon-${size}x${size}-maskable.png`);
}

async function main() {
  console.log("Generating PWA icons…");
  for (const size of sizes) {
    await generateIcon(size);
  }
  for (const size of [192, 512]) {
    await generateMaskable(size);
  }

  await sharp(svgBuffer).resize(180, 180).png().toFile(resolve(outDir, "apple-touch-icon.png"));
  console.log("✔ apple-touch-icon.png");

  await sharp(svgBuffer).resize(16, 16).png().toFile(resolve(outDir, "favicon-16x16.png"));
  await sharp(svgBuffer).resize(32, 32).png().toFile(resolve(outDir, "favicon-32x32.png"));
  console.log("✔ favicons");

  console.log("All icons generated ✓");
}

main().catch((err) => { console.error(err); process.exit(1); });
