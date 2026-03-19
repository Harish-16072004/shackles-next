const sharp = require('sharp');
const PDF = require('pdfkit');
const path = require('path');

async function test() {
  const CARD_W = 744, CARD_H = 1004;
  const templatePath = path.join(process.cwd(), 'public', 'templates', 'id-card-template.png');

  const tpl = await sharp(templatePath)
    .resize(CARD_W, CARD_H, { fit: 'fill' })
    .png()
    .toBuffer();
  console.log('Template buffer:', tpl.length, 'bytes');

  const svgText = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}">
      <text x="${CARD_W/2}" y="575" font-family="Arial" font-size="44" font-weight="bold"
            text-anchor="middle" fill="#1a1a2e">SH26GN001</text>
    </svg>`
  );

  const card = await sharp(tpl)
    .composite([{ input: svgText, top: 0, left: 0 }])
    .png()
    .toBuffer();
  console.log('Card buffer:', card.length, 'bytes');

  const doc = new PDF({ size: [841.89, 1190.55], autoFirstPage: false, margin: 0 });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const done = new Promise(r => doc.on('end', r));
  doc.addPage();
  doc.image(card, 10, 10, { width: 178, height: 240 });
  doc.end();
  await done;
  console.log('PDF OK, bytes:', Buffer.concat(chunks).length);
}

test().catch(e => console.error('FAIL:', e.message, '\n', e.stack));
