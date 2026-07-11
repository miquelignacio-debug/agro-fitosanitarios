// Genera el "Cuaderno de Aplicaciones de Plaguicidas" en formato SAG Chile

type FilaSAG = {
  fecha: string;
  cuartel: string;
  especie: string;
  variedad: string;
  plaga: string;
  nombre_comercial: string;
  numero_registro: string;
  ia: string;
  formulacion: string;
  dosis_real: number;
  unidad_dosis: string;
  consumo_ot: number | null;
  consumo_cuartel: number | null;
  mojamiento_real: number | null;
  carencia: number;
  reingreso: number;
  aplicador?: string;
  tractor?: string;
  pulverizador?: string;
  viento?: number | null;
  temperatura?: number | null;
  solicitante: string;
  responsable: string;
  dosificador: string;
  numero_ot: number;
};

type ConfigSAG = {
  empresa: string;
  temporada: string;
  filas: FilaSAG[];
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export async function generateSAGPdf({ empresa, temporada, filas }: ConfigSAG): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = 297;
  const H = 210;
  const ML = 10;
  const MR = W - 10;
  let Y = 12;

  // ── Encabezado ────────────────────────────────────────────────────────────
  doc.setFillColor(26, 71, 49);
  doc.rect(ML, Y, MR - ML, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("CUADERNO DE APLICACIONES DE PLAGUICIDAS", W / 2, Y + 6.8, { align: "center" });

  Y += 13;
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Empresa / Predio: ${empresa}`, ML, Y);
  doc.text(`Temporada: ${temporada}`, ML + 120, Y);
  doc.text(`Generado: ${new Date().toLocaleDateString("es-CL")}`, ML + 200, Y);
  Y += 5;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(ML, Y, MR, Y);
  Y += 3;

  // ── Tabla principal ────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: Y,
    margin: { left: ML, right: 10 },
    head: [[
      "Fecha\naplicación",
      "OT N°",
      "Cuartel",
      "Especie / Variedad",
      "Plaga / Enfermedad\ncontrolada",
      "Nombre Comercial\n(N° Registro SAG)",
      "Ingrediente\nActivo",
      "Form.",
      "Dosis\nreal",
      "Consumo\ntotal",
      "Consumo\ncuartel",
      "Moj. real\n(lt/ha)",
      "Carencia\n(días)",
      "Reingreso\n(h)",
      "Aplicador",
      "Tractor /\nImplemento",
      "Viento\n(km/h)",
      "Temp.\n(°C)",
      "Responsable\ntécnico",
      "Dosificador",
    ]],
    body: filas.map(f => [
      fmtDate(f.fecha),
      String(f.numero_ot),
      f.cuartel,
      `${f.especie}${f.variedad ? " / " + f.variedad : ""}`,
      f.plaga || "—",
      f.nombre_comercial + (f.numero_registro ? `\n(${f.numero_registro})` : ""),
      f.ia || "—",
      f.formulacion || "—",
      `${f.dosis_real} ${f.unidad_dosis}`,
      f.consumo_ot !== null ? `${f.consumo_ot} ${f.unidad_dosis.split("/")[0]}` : "—",
      f.consumo_cuartel !== null ? `${f.consumo_cuartel} ${f.unidad_dosis.split("/")[0]}` : "—",
      f.mojamiento_real !== null ? String(f.mojamiento_real) : "—",
      String(f.carencia),
      String(f.reingreso),
      f.aplicador || "—",
      [f.tractor, f.pulverizador].filter(Boolean).join(" / ") || "—",
      f.viento !== null && f.viento !== undefined ? String(f.viento) : "—",
      f.temperatura !== null && f.temperatura !== undefined ? String(f.temperatura) : "—",
      f.responsable || "—",
      f.dosificador || "—",
    ]),
    headStyles: {
      fillColor: [26, 71, 49],
      textColor: 255,
      fontSize: 6.5,
      fontStyle: "bold",
      halign: "center",
      lineColor: [255, 255, 255],
      lineWidth: 0.3,
    },
    bodyStyles: { fontSize: 7, valign: "middle" },
    alternateRowStyles: { fillColor: [240, 248, 244] },
    columnStyles: {
      0:  { cellWidth: 15, halign: "center" },
      1:  { cellWidth: 9,  halign: "center" },
      2:  { cellWidth: 13, halign: "center", fontStyle: "bold" },
      3:  { cellWidth: 22 },
      4:  { cellWidth: 24 },
      5:  { cellWidth: 30 },
      6:  { cellWidth: 24 },
      7:  { cellWidth: 9 },
      8:  { cellWidth: 16, halign: "center" },
      9:  { cellWidth: 13, halign: "center" },
      10: { cellWidth: 13, halign: "center", fontStyle: "bold" },
      11: { cellWidth: 12, halign: "center" },
      12: { cellWidth: 11, halign: "center" },
      13: { cellWidth: 10, halign: "center" },
      14: { cellWidth: 18 },
      15: { cellWidth: 20 },
      16: { cellWidth: 10, halign: "center" },
      17: { cellWidth: 9,  halign: "center" },
      18: { cellWidth: 18 },
      19: { cellWidth: 18 },
    },
    styles: { cellPadding: 1.5, lineColor: [220, 230, 225], lineWidth: 0.15 },
    tableLineColor: [26, 71, 49],
    tableLineWidth: 0.4,
    didDrawPage: (data) => {
      // Footer en cada página
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text(
        `${empresa} — Cuaderno de Aplicaciones — Temporada ${temporada} — Pág. ${data.pageNumber}`,
        W / 2, H - 5, { align: "center" }
      );
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ── Bloque de firmas ──────────────────────────────────────────────────────
  if (finalY < H - 40) {
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    const firmas = ["Responsable Técnico (firma y timbre)", "Encargado de Bodega", "Revisado por"];
    const fw = (MR - ML) / 3;
    firmas.forEach((label, i) => {
      const x = ML + i * fw;
      doc.line(x + 5, finalY + 18, x + fw - 5, finalY + 18);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(label, x + fw / 2, finalY + 22, { align: "center" });
    });
  }

  doc.save(`cuaderno-SAG-${empresa.replace(/\s+/g, "-")}-${temporada}.pdf`);
}
