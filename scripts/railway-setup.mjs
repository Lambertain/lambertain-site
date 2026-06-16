/**
 * Настройка переменных окружения на Railway через GraphQL.
 * Запуск: RAILWAY_TOKEN=<token> node --env-file=.env.local scripts/railway-setup.mjs <serviceId>
 * Читает значения из process.env (которые Next подгрузил из .env.local) и заливает на сервис.
 */
const TOKEN = process.env.RAILWAY_TOKEN;
const PROJECT_ID = "18f5f4a9-0766-4370-bc10-3b8561d3ef67";
const ENV_ID = "2ccf4a50-6c1d-4463-86b1-89f7cf12138c";
const SERVICE_ID = process.argv[2];

const VARS = [
  "ANTHROPIC_API_KEY", "STRUCTURER_MODEL",
  "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "TELEGRAM_BOT_USERNAME", "TELEGRAM_MINIAPP_SHORTNAME",
  "ADMIN_PASSWORD", "ADMIN_TELEGRAM_ID", "SESSION_SECRET",
  "DATABASE_URL",
];

async function gql(query, variables) {
  const r = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const d = await r.json();
  if (d.errors) throw new Error(JSON.stringify(d.errors));
  return d.data;
}

const M = `mutation($in:VariableUpsertInput!){ variableUpsert(input:$in) }`;

if (!TOKEN || !SERVICE_ID) {
  console.error("Нужны RAILWAY_TOKEN и аргумент serviceId");
  process.exit(1);
}

let n = 0;
for (const name of VARS) {
  const value = process.env[name];
  if (value == null || value === "") {
    console.log(`пропуск ${name} (пусто)`);
    continue;
  }
  await gql(M, {
    in: { projectId: PROJECT_ID, environmentId: ENV_ID, serviceId: SERVICE_ID, name, value, skipDeploys: true },
  });
  console.log(`set ${name}`);
  n++;
}
console.log(`Готово: ${n} переменных на сервис ${SERVICE_ID}`);
