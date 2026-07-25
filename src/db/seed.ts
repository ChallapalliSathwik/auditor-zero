import "dotenv/config";
import { seedDemoDocuments } from "./demo-docs";

function main() {
  console.log("Seeding Auditor Zero demo documents...");
  const { byKey } = seedDemoDocuments();

  console.log("Seeded doc IDs:");
  console.log(Object.fromEntries(Object.entries(byKey).map(([k, d]) => [k, d.id])));
  console.log(
    "\nRun analyze_document (or POST /api/audits) with all seeded IDs to see:\n" +
      "  • numeric cross-version conflict — password rotation 90d (v1) vs 180d (v2)\n" +
      "  • category disappearance         — full-disk encryption clause removed in v3\n" +
      "  • cross-version semantic change  — VPN 'required' (v2) vs 'optional' (v3)\n" +
      "  • cross-document contradiction   — Security Policy vs BYOD on encryption"
  );
}

main();
