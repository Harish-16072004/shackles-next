const fs = require('fs');
const files = [
  'src/app/api/admin/payments/export/route.ts',
  'src/app/api/admin/id-cards/export/route.ts',
  'src/app/api/admin/csv/registrations/template/route.ts',
  'src/app/api/admin/csv/events/template/route.ts',
  'src/app/api/admin/csv/events/export/route.ts',
  'src/app/api/admin/csv/registrations/export/route.ts',
  'src/app/api/admin/csv/audit/export/route.ts',
  'src/app/api/admin/csv/attendance/export/route.ts',
  'src/app/api/admin/accommodations/download/route.ts'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let text = fs.readFileSync(f, 'utf8');
    // Replace: "Content-Disposition": `attachment; filename="ANY_THING"`
    // With: "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    // We'll use a replacer function to grab the inside
    text = text.replace(/"Content-Disposition":\s*`attachment;\s*filename="([^`]+)"`/g, (match, p1) => {
      // If it already has filename*=, skip
      if (match.includes('filename*=')) return match;
      
      // We need to be careful: the inside (p1) could be a template literal expression like ${fileName}
      // If the entire p1 is exactly ${fileName} or ${filename}, we can just output it.
      // If p1 is a mix like events-${date}.csv, we should construct it safely.
      return `"Content-Disposition": \`attachment; filename="${p1}"; filename*=UTF-8''\${encodeURIComponent(\`${p1}\`)}\``;
    });
    fs.writeFileSync(f, text);
    console.log('Fixed', f);
  }
});
