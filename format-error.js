const fs = require('fs');
let code = fs.readFileSync('server-db.ts', 'utf8');
code = code.replace(/console\.warn\("\[Firestore\] fallback to cache\. Reason: " \+ \(err\?\.message \|\| err\)\);/g, `
    const msg = String(err?.message || err);
    console.warn("[Firestore] Operation failed (falling back to cache):", msg.split('. Cause')[0]);
`);
fs.writeFileSync('server-db.ts', code);
