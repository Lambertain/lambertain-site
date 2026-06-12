// Разовый прогон ИИ-проработки задачи против БД из DATABASE_URL. Использование:
//   DATABASE_URL=... npx tsx scripts/run-drafter.ts LAM-21
import { draftTask } from "../src/lib/drafter";

const id = process.argv[2];
if (!id) { console.error("usage: run-drafter.ts <READABLE_ID>"); process.exit(1); }
(async () => {
  console.log("drafting", id, "…");
  await draftTask(id);
  console.log("done");
  process.exit(0);
})();
