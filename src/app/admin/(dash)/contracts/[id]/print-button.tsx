"use client";

import { ui } from "../../../ui-styles";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} style={ui.btnAccent}>
      Друк / Зберегти PDF
    </button>
  );
}
