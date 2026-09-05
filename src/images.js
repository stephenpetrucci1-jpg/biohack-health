/**
 * Turn a folder of source images into the sizes and formats the site serves.
 *
 *   drop files into images-in/  (any name, .png .jpg .jpeg .webp)
 *   npm run images
 *
 * Each file becomes four outputs in public/img: AVIF and WebP, at 1376 and
 * 688 wide. The basename becomes the value you put in a post's `hero:` field,
 * so images-in/bpc-157-tendons.png becomes `hero: bpc-157-tendons`.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const IN = path.resolve(__dirname, 'images-in');
const OUT = path.resolve(__dirname, 'public', 'img');

(async () => {
  if (!fs.existsSync(IN)) return console.log('no images-in/ folder, nothing to do');
  fs.mkdirSync(OUT, { recursive: true });

  const files = fs.readdirSync(IN).filter((f) => /\.(png|jpe?g|webp|tiff?)$/i.test(f));
  if (!files.length) return console.log('images-in/ is empty, nothing to do');

  for (const file of files) {
    const name = path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const src = path.join(IN, file);
    const before = fs.statSync(src).size;

    for (const width of [1376, 688]) {
      const suffix = width === 1376 ? '' : '-688';
      await sharp(src).resize(width).avif({ quality: 52, effort: 6 }).toFile(path.join(OUT, `${name}${suffix}.avif`));
      await sharp(src).resize(width).webp({ quality: 78 }).toFile(path.join(OUT, `${name}${suffix}.webp`));
    }

    const after = fs.statSync(path.join(OUT, `${name}.avif`)).size;
    console.log(
      `${name.padEnd(34)} ${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(0)}KB avif   use  hero: ${name}`
    );
  }
  console.log(`\n${files.length} image(s) done. Delete them from images-in/ once you are happy.`);
})();
