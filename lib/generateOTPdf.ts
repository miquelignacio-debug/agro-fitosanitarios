import type { OrdenTrabajo } from "./types";
import { ESTADOS_OT } from "./types";

type OTParaPDF = OrdenTrabajo & {
  empresa: { nombre: string } | null;
  solicitante: { nombre: string } | null;
  responsable: { nombre: string } | null;
  dosificador: { nombre: string } | null;
  ot_cuarteles: {
    superficie_ha: number;
    cuartel: { codigo: string; especie: string; variedad: string; patron: string | null };
  }[];
  ot_aplicadores: {
    operador: { nombre: string };
    tractor: { codigo: string } | null;
    pulverizador: { codigo: string } | null;
    cantidad_maquinadas: number | null;
  }[];
  ot_productos: {
    dosis_real: number;
    dosis_unidad: string;
    carencia_dias: number;
    rei_horas: number;
    fecha_viable: string | null;
    consumo_total: number | null;
    producto: {
      nombre_comercial: string;
      ingrediente_activo: string | null;
      formulacion: string | null;
      especies_autorizadas: string[] | null;
    };
  }[];
};

const VERDE = "#1a4731";
const VERDE_CLARO = "#e8f5ee";
const GRIS = "#6b7280";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

export async function generateOTPdf(ot: OTParaPDF): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const ML = 14;
  const MR = W - 14;
  const CW = MR - ML;
  let Y = 14;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const verdeFill = () => {
    doc.setFillColor(26, 71, 49);
    doc.setTextColor(255, 255, 255);
  };
  const resetText = () => doc.setTextColor(30, 30, 30);
  const line = (y: number) => {
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(ML, y, MR, y);
  };

  // ── ENCABEZADO ───────────────────────────────────────────────────────────
  verdeFill();
  doc.rect(ML, Y, CW, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`ORDEN DE TRABAJO N° ${ot.numero}`, W / 2, Y + 5.5, { align: "center" });
  doc.setFontSize(10);
  doc.text(ot.empresa?.nombre?.toUpperCase() ?? "", W / 2, Y + 11, { align: "center" });
  resetText();
  Y += 18;

  // Estado + fechas en fila
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  const estado = ESTADOS_OT[ot.estado] ?? ot.estado;
  doc.text(`Estado: ${estado}`, ML, Y);
  doc.text(`Solicitud: ${fmtDate(ot.fecha_solicitud)}`, ML + 50, Y);
  doc.text(`Aplicación: ${fmtDate(ot.fecha_aplicacion)}`, ML + 110, Y);
  resetText();
  Y += 5;
  line(Y);
  Y += 4;

  // ── RESPONSABLES (fila compacta) ──────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(26, 71, 49);
  doc.text("RESPONSABLES", ML, Y);
  Y += 4;
  resetText();
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  const resp = [
    ["Solicitante:", ot.solicitante?.nombre ?? "—"],
    ["Dosificador:", ot.dosificador?.nombre ?? "—"],
    ["Responsable:", ot.responsable?.nombre ?? "—"],
  ];
  const col = CW / 3;
  resp.forEach(([label, val], i) => {
    const x = ML + i * col;
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(80, 80, 80);
    doc.text(label, x, Y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); resetText();
    doc.text(val, x, Y + 4);
  });
  Y += 10;

  if (ot.campo) {
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80, 80, 80);
    doc.text("Campo:", ML, Y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); resetText();
    doc.text(ot.campo, ML + 14, Y);
    Y += 6;
  }

  // Plagas / objetivo
  if (ot.plagas_objetivo || ot.objetivo_principal) {
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80, 80, 80);
    doc.text("Objetivo:", ML, Y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); resetText();
    const obj = [ot.plagas_objetivo, ot.objetivo_principal].filter(Boolean).join(" — ");
    doc.text(obj, ML + 17, Y, { maxWidth: CW - 17 });
    Y += 6;
  }
  line(Y); Y += 4;

  // ── CUARTELES ─────────────────────────────────────────────────────────────
  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(26, 71, 49);
  doc.text("CUARTELES A TRATAR", ML, Y);
  Y += 2;

  const supTotal = ot.ot_cuarteles.reduce((s, c) => s + c.superficie_ha, 0);
  autoTable(doc, {
    startY: Y,
    margin: { left: ML, right: 14 },
    head: [["Cuartel", "Especie", "Variedad", "Patrón", "Superficie (ha)"]],
    body: ot.ot_cuarteles.map((c) => [
      c.cuartel.codigo,
      c.cuartel.especie,
      c.cuartel.variedad,
      c.cuartel.patron ?? "—",
      c.superficie_ha.toFixed(2),
    ]).concat([["", "", "", "TOTAL", supTotal.toFixed(2)]]),
    headStyles: { fillColor: [26, 71, 49], textColor: 255, fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 4: { halign: "right", fontStyle: "bold" } },
    alternateRowStyles: { fillColor: [240, 248, 244] },
    styles: { cellPadding: 2 },
    didParseCell: (data) => {
      if (data.row.index === ot.ot_cuarteles.length && data.section === "body") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [220, 240, 230];
      }
    },
  });
  Y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

  // ── APLICADORES ───────────────────────────────────────────────────────────
  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(26, 71, 49);
  doc.text("APLICADORES", ML, Y);
  Y += 2;

  autoTable(doc, {
    startY: Y,
    margin: { left: ML, right: 14 },
    head: [["Operador", "Tractor", "Pulverizadora", "N° Maquinadas"]],
    body: ot.ot_aplicadores.map((a) => [
      a.operador.nombre,
      a.tractor?.codigo ?? "—",
      a.pulverizador?.codigo ?? "—",
      a.cantidad_maquinadas !== null ? String(a.cantidad_maquinadas) : "—",
    ]),
    headStyles: { fillColor: [26, 71, 49], textColor: 255, fontSize: 8, fontStyle: "bold" },
    bodyStyles: { fontSize: 8 },
    styles: { cellPadding: 2 },
  });
  Y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

  // ── MOJAMIENTO ────────────────────────────────────────────────────────────
  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(80, 80, 80);
  const horaIni = ot.hora_inicio ?? "05:00";
  const horaFin = ot.hora_fin ?? "12:00";
  doc.text(
    `Hora: ${horaIni} – ${horaFin}   |   Mojamiento solicitado: ${ot.mojamiento_solicitado_ltha ?? "—"} lt/ha   |   Mojamiento real: ${ot.mojamiento_real_ltha ?? "___"} lt/ha`,
    ML, Y
  );
  resetText();
  Y += 6;

  // ── PRODUCTOS (sección principal — más visible) ───────────────────────────
  // Rectángulo de título destacado
  doc.setFillColor(26, 71, 49);
  doc.rect(ML, Y, CW, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PRODUCTOS A APLICAR", W / 2, Y + 4.8, { align: "center" });
  resetText();
  Y += 9;

  autoTable(doc, {
    startY: Y,
    margin: { left: ML, right: 14 },
    head: [[
      "N°",
      "Producto",
      "Ingrediente activo",
      "Dosis real",
      "Consumo total",
      "Carencia\n(días)",
      "Reingreso\n(horas)",
      "Fecha viable\ncosecha",
    ]],
    body: ot.ot_productos.map((p, i) => {
      const unidad = p.dosis_unidad;
      const consumoUnidad = unidad.split("/")[0] ?? "lt";
      return [
        String(i + 1),
        p.producto.nombre_comercial,
        p.producto.ingrediente_activo ?? "—",
        `${p.dosis_real} ${unidad}`,
        p.consumo_total !== null ? `${p.consumo_total.toFixed(2)} ${consumoUnidad}` : "—",
        String(p.carencia_dias),
        String(p.rei_horas),
        fmtDate(p.fecha_viable),
      ];
    }),
    headStyles: {
      fillColor: [232, 245, 238],
      textColor: [26, 71, 49],
      fontSize: 8,
      fontStyle: "bold",
      lineColor: [26, 71, 49],
      lineWidth: 0.4,
    },
    bodyStyles: { fontSize: 9, fontStyle: "normal" },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 40, fontStyle: "bold" },
      2: { cellWidth: 35 },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 22, halign: "center", fontStyle: "bold" },
      5: { cellWidth: 12, halign: "center" },
      6: { cellWidth: 12, halign: "center" },
      7: { cellWidth: 22, halign: "center" },
    },
    alternateRowStyles: { fillColor: [248, 254, 251] },
    styles: {
      cellPadding: 2.5,
      lineColor: [210, 220, 215],
      lineWidth: 0.2,
      fontSize: 9,
    },
    tableLineColor: [26, 71, 49],
    tableLineWidth: 0.4,
  });
  Y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // Advertencia PHI si hay fecha viable
  const maxPhi = Math.max(...ot.ot_productos.map((p) => p.carencia_dias));
  if (maxPhi > 0 && ot.fecha_aplicacion) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(180, 60, 0);
    doc.text(
      `⚠  Respetar períodos de carencia. La fecha de cosecha más restrictiva aplica sobre el cuartel tratado.`,
      ML, Y
    );
    resetText();
    Y += 5;
  }

  // ── PPE ───────────────────────────────────────────────────────────────────
  const ppeItems = [
    ot.ppe_traje && "Traje",
    ot.ppe_guantes && "Guantes",
    ot.ppe_anteojos && "Anteojos",
    ot.ppe_gorro && "Gorro",
    ot.ppe_mascarilla && "Mascarilla",
    ot.ppe_botas && "Botas",
  ].filter(Boolean) as string[];

  if (ppeItems.length) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text("PPE requerido:", ML, Y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    doc.text(ppeItems.join("  ·  "), ML + 25, Y);
    Y += 5;
  }

  // ── NOTAS ─────────────────────────────────────────────────────────────────
  if (ot.notas) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold"); doc.setTextColor(80, 80, 80);
    doc.text("Notas:", ML, Y);
    doc.setFont("helvetica", "normal"); resetText();
    doc.text(ot.notas, ML + 14, Y, { maxWidth: CW - 14 });
    Y += 8;
  }

  // ── FIRMAS ───────────────────────────────────────────────────────────────
  // Espacio para firmas al final
  const pageH = 297;
  const firmasY = Math.max(Y + 10, pageH - 45);

  line(firmasY);
  const firmas = [
    { label: "Dosificador", nombre: ot.dosificador?.nombre ?? "" },
    { label: "Aplicador", nombre: ot.ot_aplicadores.map((a) => a.operador.nombre).join(" / ") },
    { label: "Responsable", nombre: ot.responsable?.nombre ?? "" },
  ];
  const fw = CW / 3;

  firmas.forEach((f, i) => {
    const x = ML + i * fw;
    const cx = x + fw / 2;

    // Línea de firma
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.4);
    doc.line(x + 4, firmasY + 18, x + fw - 4, firmasY + 18);

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold"); doc.setTextColor(80, 80, 80);
    doc.text(f.label.toUpperCase(), cx, firmasY + 22, { align: "center" });

    if (f.nombre) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); resetText();
      doc.text(f.nombre, cx, firmasY + 27, { align: "center" });
    }
  });

  // ── PIE DE PÁGINA ─────────────────────────────────────────────────────────
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text(
    `Agro Fitosanitarios · OT N° ${ot.numero} · Generado ${new Date().toLocaleDateString("es-CL")}`,
    W / 2, pageH - 6,
    { align: "center" }
  );

  doc.save(`OT-${String(ot.numero).padStart(4, "0")}-${ot.empresa?.nombre?.replace(/\s+/g, "-") ?? "empresa"}.pdf`);
}
