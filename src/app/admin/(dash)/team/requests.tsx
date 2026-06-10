"use client";

import { useState, useTransition } from "react";
import { approveAccess, rejectAccess } from "./actions";
import { ui } from "../../ui-styles";

type Usr = { login: string; fullName: string; role: string };
type Req = { tg_id: number; username: string | null; full_name: string | null; requested_role: string };

function RequestRow({ req, users }: { req: Req; users: Usr[] }) {
  const [login, setLogin] = useState("");
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const roleRu = req.requested_role === "client" ? "Клиент" : "Разработчик";

  if (done) {
    return (
      <div style={{ ...ui.card, padding: 14 }}>
        <span style={{ ...ui.monoLabel, color: done === "approved" ? "var(--accent)" : "var(--muted)" }}>
          {req.full_name || req.tg_id} — {done === "approved" ? "доступ открыт" : "отклонено"}
        </span>
      </div>
    );
  }

  return (
    <div style={{ ...ui.card, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{req.full_name || "—"}</span>
        {req.username && <span style={ui.monoLabel}>@{req.username}</span>}
        <span style={{ ...ui.monoLabel, color: "var(--accent)" }}>хочет: {roleRu}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10 }}>
        <select value={login} onChange={(e) => setLogin(e.target.value)} style={ui.input}>
          <option value="">— YouTrack-логин —</option>
          {users.map((u) => (
            <option key={u.login} value={u.login}>
              {u.fullName} ({u.login})
            </option>
          ))}
        </select>
        <button
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await approveAccess(req.tg_id, req.full_name || "", login, req.requested_role as "client" | "contributor");
              if (r.error) setError(r.error);
              else setDone("approved");
            })
          }
          disabled={pending || !login}
          style={{ ...ui.btnAccent, opacity: pending || !login ? 0.5 : 1 }}
        >
          Подтвердить
        </button>
        <button
          onClick={() =>
            start(async () => {
              await rejectAccess(req.tg_id);
              setDone("rejected");
            })
          }
          disabled={pending}
          style={ui.btn}
        >
          Отклонить
        </button>
      </div>
      {error && <p style={{ ...ui.monoLabel, color: "#ff5b5b", textTransform: "none", marginTop: 8 }}>{error}</p>}
    </div>
  );
}

export function AccessRequests({ requests, users }: { requests: Req[]; users: Usr[] }) {
  if (!requests.length) return null;
  return (
    <div style={{ marginTop: 28 }}>
      <div style={ui.monoLabel}>Ожидают подтверждения</div>
      <h2 style={{ ...ui.h1, fontSize: 22, marginTop: 8, marginBottom: 14 }}>Заявки на доступ</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {requests.map((r) => (
          <RequestRow key={r.tg_id} req={r} users={users} />
        ))}
      </div>
    </div>
  );
}
