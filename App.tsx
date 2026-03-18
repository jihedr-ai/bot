import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import {
  Trash2,
  Download,
  Plus,
  Type,
  ChevronLeft,
  ChevronRight,
  Palette,
  Layout,
  Box,
  Zap,
  Image as ImageIcon,
  CheckCircle2,
  AlignCenter,
  AlignLeft,
  AlignRight,
  FileSpreadsheet,
  Lock,
  Upload,
  Maximize,
  Ruler,
  CheckCircle,
  Sparkles,
  MoveUpLeft,
  MoveUp,
  MoveUpRight,
  MoveLeft,
  Target,
  MoveRight,
  MoveDownLeft,
  MoveDown,
  MoveDownRight,
  Maximize2,
  Loader2,
  AlertTriangle,
  Cpu,
  Eraser,
  SlidersHorizontal,
  X,
  Scissors,
  Bot,
  Send,
  User,
  Sparkle,
  ShoppingCart,
} from "lucide-react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import * as pdfjs from "pdfjs-dist";
import { GoogleGenAI } from "@google/genai";

// Initialize PDF.js worker using the version from the package
const PDFJS_VERSION = "5.5.207";
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

import {
  MaterialFamily,
  ShapeType,
  AttachmentType,
  TagStyle,
  NametagItem,
  StudioState,
} from "./types";
import { PLASTIC_COLORS, METAL_FINISHES, FONTS, DEFAULT_STYLE, PRICING } from "./constants";
import { Language, translations } from "./translations";

// -------------------- Unit Conversion Helpers --------------------
const IN_TO_MM = 25.4;
const MM_TO_IN = 1 / 25.4;

const mmToIn = (mm: number) => mm * MM_TO_IN;
const inToMm = (inch: number) => inch * IN_TO_MM;

const parseUserDimension = (input: string, currentUnit: "in" | "mm"): number => {
  const cleanInput = input.toLowerCase().trim();
  const value = parseFloat(cleanInput.replace(",", "."));
  if (isNaN(value)) return 0;

  if (cleanInput.endsWith("in") || cleanInput.endsWith('"')) return inToMm(value);
  if (cleanInput.endsWith("mm")) return value;

  return currentUnit === "in" ? inToMm(value) : value;
};

const formatDimension = (mmValue: number, currentUnit: "in" | "mm"): string => {
  if (currentUnit === "in") {
    const val = mmToIn(mmValue);
    return Number(val.toFixed(3)).toString();
  }
  return Number(mmValue.toFixed(2)).toString();
};

// -------------------- Custom Shape Helpers --------------------
const normalizePathData = (d: string, viewBox: { minX: number; minY: number; w: number; h: number }): string => {
  const tokenRegex = /([a-df-z])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  const tokens = d.match(tokenRegex) || [];
  let normalized = "";
  let isX = true; 
  let currentCommand = "";
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/[a-df-z]/i.test(t)) {
      currentCommand = t;
      normalized += t;
      if (currentCommand.toLowerCase() === 'v') isX = false;
      else isX = true;
    } else {
      const val = parseFloat(t);
      const isRelative = currentCommand === currentCommand.toLowerCase() && currentCommand !== 'z';
      if (isRelative) {
        if (currentCommand.toLowerCase() === 'h') normalized += (val / viewBox.w).toFixed(6);
        else if (currentCommand.toLowerCase() === 'v') normalized += (val / viewBox.h).toFixed(6);
        else if (isX) { normalized += (val / viewBox.w).toFixed(6); isX = false; }
        else { normalized += (val / viewBox.h).toFixed(6); isX = true; }
      } else {
        if (currentCommand.toUpperCase() === 'H') normalized += ((val - viewBox.minX) / viewBox.w).toFixed(6);
        else if (currentCommand.toUpperCase() === 'V') normalized += ((val - viewBox.minY) / viewBox.h).toFixed(6);
        else if (isX) { normalized += ((val - viewBox.minX) / viewBox.w).toFixed(6); isX = false; }
        else { normalized += ((val - viewBox.minY) / viewBox.h).toFixed(6); isX = true; }
      }
      if (i < tokens.length - 1 && !/[a-df-z]/i.test(tokens[i+1])) normalized += " ";
    }
  }
  return normalized;
};

const getCandidatePathD = (el: Element): string => {
  const tag = el.tagName.toLowerCase();
  if (tag === 'path') return el.getAttribute('d') || "";
  if (tag === 'rect') {
    const x = parseFloat(el.getAttribute('x') || '0');
    const y = parseFloat(el.getAttribute('y') || '0');
    const w = parseFloat(el.getAttribute('width') || '0');
    const h = parseFloat(el.getAttribute('height') || '0');
    return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
  }
  if (tag === 'circle') {
    const cx = parseFloat(el.getAttribute('cx') || '0');
    const cy = parseFloat(el.getAttribute('cy') || '0');
    const r = parseFloat(el.getAttribute('r') || '0');
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
  }
  return "";
};

const selectCutlineFromSvg = (svgDoc: Document): { d: string; viewBox: { minX: number; minY: number; w: number; h: number } } | null => {
  const svgEl = svgDoc.querySelector('svg');
  if (!svgEl) return null;
  let minX = 0, minY = 0, w = 100, h = 100;
  const vbStr = svgEl.getAttribute('viewBox');
  if (vbStr) [minX, minY, w, h] = vbStr.split(/[\s,]+/).map(parseFloat);
  else {
    w = parseFloat(svgEl.getAttribute('width') || "100");
    h = parseFloat(svgEl.getAttribute('height') || "100");
  }
  const elements = Array.from(svgDoc.querySelectorAll('path, rect, circle, ellipse, polygon'));
  const candidates = elements.map(el => {
    const d = getCandidatePathD(el);
    if (!d || (!d.toLowerCase().includes('z') && !d.toLowerCase().includes('h') && !d.toLowerCase().includes('v'))) return null;
    const id = (el.id || "").toLowerCase();
    const cls = (el.getAttribute('class') || "").toLowerCase();
    const isCutNamed = id.includes("cut") || id.includes("outline") || id.includes("border") || id.includes("die") ||
                      cls.includes("cut") || cls.includes("outline") || cls.includes("border") || cls.includes("die");
    const isStandardCutStyle = el.getAttribute('stroke') && (el.getAttribute('fill') === 'none' || el.getAttribute('fill') === 'transparent');
    return { el, d, isCutNamed, isStandardCutStyle };
  }).filter(Boolean) as any[];

  if (candidates.length === 0) return null;
  const testCanvas = document.createElement('canvas');
  testCanvas.width = 1000; testCanvas.height = 1000;
  const tCtx = testCanvas.getContext('2d');
  if (!tCtx) return null;

  const results = candidates.map((cand, i) => {
    let containersCount = 0;
    candidates.forEach((other, j) => {
      if (i === j) return;
      const normPath = new Path2D(normalizePathData(other.d, { minX, minY, w, h }));
      tCtx.clearRect(0,0,1000,1000); tCtx.save(); tCtx.scale(1000, 1000);
      if (tCtx.isPointInPath(normPath, 0.5, 0.5)) containersCount++;
      tCtx.restore();
    });
    return { ...cand, score: (cand.isCutNamed ? 1000 : 0) + (cand.isStandardCutStyle ? 500 : 0), containersCount };
  });

  const outermost = results.filter(r => r.containersCount === 0);
  const winner = outermost.sort((a, b) => b.score - a.score)[0] || results[0];
  return { d: winner.d, viewBox: { minX, minY, w, h } };
};

const traceImageOutline = (canvas: HTMLCanvasElement): string => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return "";
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const points: { x: number; y: number }[] = [];
  const cx = width / 2, cy = height / 2;
  for (let i = 0; i < 180; i++) {
    const angle = (i / 180) * Math.PI * 2;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let dist = Math.max(width, height);
    while (dist > 0) {
      const px = Math.floor(cx + dx * dist), py = Math.floor(cy + dy * dist);
      if (px >= 0 && px < width && py >= 0 && py < height) {
        if (data[(py * width + px) * 4 + 3] > 100) { points.push({ x: px, y: py }); break; }
      }
      dist -= 1;
    }
  }
  if (points.length < 3) return `M 0 0 H ${width} V ${height} H 0 Z`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) d += ` L ${points[i].x} ${points[i].y}`;
  return d + " Z";
};

// -------------------- SVG Rendering Helpers --------------------
const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const measureTextCanvas = (text: string, font: string, size: number, weight: string) => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { width: 0, ascent: size * 0.8, height: size * 1.15 };
  ctx.font = `${weight} ${size}px "${font}", Arial, sans-serif`;
  const metrics = ctx.measureText(text);
  const ascent = (metrics as any).actualBoundingBoxAscent || size * 0.8;
  return { width: metrics.width, ascent, height: size * 1.25 };
};

const wrapAndFitTextToAreaInternal = (
  text: string,
  mw: number,
  _mh: number,
  sz: number,
  maxL: number,
  font: string,
  weight: string
) => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";
  let hasWidthOverflow = false;
  const safetyFactor = 1.12; // Canvas measurement is often tighter than SVG/Browser rendering

  for (const word of words) {
    // Split by hyphen but keep the hyphen with the prefix
    const parts = word.split("-");
    for (let i = 0; i < parts.length; i++) {
      const isLastPart = i === parts.length - 1;
      const part = parts[i] + (isLastPart ? "" : "-");
      
      // If it's the first part of a word (not following a hyphen), add a space if currentLine exists
      const separator = (currentLine && !currentLine.endsWith("-")) ? " " : "";
      const testLine = currentLine ? currentLine + separator + part : part;
      const testWidth = measureTextCanvas(testLine, font, sz, weight).width * safetyFactor;

      if (testWidth > mw) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = part;
          if (measureTextCanvas(part, font, sz, weight).width * safetyFactor > mw) {
            hasWidthOverflow = true;
          }
        } else {
          currentLine = part;
          hasWidthOverflow = true;
        }
      } else {
        currentLine = testLine;
      }
    }
  }
  if (currentLine) lines.push(currentLine);
  const isTruncated = lines.length > maxL;
  const finalLines = lines.slice(0, maxL);
  const lh = sz * 1.25;
  const bh = finalLines.length * lh;
  return { lines: finalLines, sz, lh, bh, overflow: hasWidthOverflow || isTruncated };
};

const fitTextToArea = (name: string, title: string, maxWidth: number, maxHeight: number, style: TagStyle) => {
  const minNameSize = 8;
  const minTitleSize = 7.5;
  const gap = 4;

  let nameSize = style.nameSize;
  let titleSize = style.titleSize;

  const tryFit = (ns: number, ts: number) => {
    const nLines = style.isMultiline ? 3 : 1;
    const tLines = style.isMultiline ? 2 : 1;
    const nFit = wrapAndFitTextToAreaInternal(name, maxWidth, maxHeight, ns, nLines, style.fontFamily, style.bold ? "900" : "700");
    const tFit = wrapAndFitTextToAreaInternal(title, maxWidth, maxHeight, ts, tLines, style.fontFamily, "600");
    const totalH = nFit.bh + gap + tFit.bh;
    const fits = totalH <= maxHeight && !nFit.overflow && !tFit.overflow;
    return { fits, nFit, tFit, totalH };
  };

  let current = tryFit(nameSize, titleSize);
  if (current.fits) return current;

  // Balanced shrinking: prioritize keeping the title readable
  while ((nameSize > minNameSize || titleSize > minTitleSize) && !current.fits) {
    if (nameSize > minNameSize) {
      nameSize -= 0.5;
    }
    // Shrink title only if it's still large relative to the name
    if (titleSize > minTitleSize && (titleSize > nameSize * 0.75 || nameSize <= minNameSize + 1)) {
      titleSize -= 0.25;
    }
    current = tryFit(nameSize, titleSize);
  }

  return current;
};

const parseSvgForInline = (svgXml: string) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgXml, "image/svg+xml");
  const svgEl = doc.documentElement;
  if (!svgEl || svgEl.nodeName.toLowerCase() !== "svg") return null;

  const serializer = new XMLSerializer();
  
  // Extract defs and styles to move them to the top level later
  // Illustrator is very picky about nested defs/styles
  const defsElements = Array.from(doc.querySelectorAll("defs, style"));
  const defsContent = defsElements.map(el => {
    if (el.nodeName.toLowerCase() === "style") {
      return serializer.serializeToString(el);
    }
    return Array.from(el.childNodes).map(c => serializer.serializeToString(c)).join("");
  }).join("\n");
  
  // Remove them from the inline content to avoid duplication and nesting issues
  defsElements.forEach(el => el.remove());

  let viewBox = svgEl.getAttribute("viewBox");
  if (!viewBox) {
    const wAttr = svgEl.getAttribute("width") || "0";
    const hAttr = svgEl.getAttribute("height") || "0";
    const w = parseFloat(String(wAttr).replace(/[a-z%]/gi, "")) || 0;
    const h = parseFloat(String(hAttr).replace(/[a-z%]/gi, "")) || 0;
    viewBox = w > 0 && h > 0 ? `0 0 ${w} ${h}` : "0 0 100 100";
  }
  svgEl.removeAttribute("width");
  svgEl.removeAttribute("height");
  const inner = Array.from(svgEl.childNodes)
    .map((n) => serializer.serializeToString(n))
    .join("");
  const vb = (viewBox || "0 0 100 100").trim().split(/\s+|,/).map(Number);
  return { inner, defs: defsContent, vbX: vb[0] || 0, vbY: vb[1] || 0, vbW: vb[2] || 100, vbH: vb[3] || 100 };
};

// -------------------- Typo Helpers --------------------
const NAMETAG_DICTIONARY = [
  "ALEXANDRE",
  "MARIE",
  "JEAN",
  "PIERRE",
  "SÉBASTIEN",
  "ÉMILIE",
  "FRANÇOIS",
  "NICOLAS",
  "BENOÎT",
  "STÉPHANE",
  "TREMBLAY",
  "DUPONT",
  "MARTIN",
  "BOUCHARD",
  "GAGNON",
  "ROY",
  "COUTU",
  "LEFEBVRE",
  "MORIN",
  "LABERGE",
  "ALEXANDER",
  "EMILY",
  "MICHAEL",
  "SARAH",
  "WILLIAM",
  "ELIZABETH",
  "ROBERT",
  "JENNIFER",
  "DAVID",
  "THOMAS",
  "SMITH",
  "JOHNSON",
  "BROWN",
  "WILLIAMS",
  "JONES",
  "MILLER",
  "DAVIS",
  "GARCIA",
  "RODRIGUEZ",
  "WILSON",
];

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const isNonLatin = (text: string) => /[^\u0000-\u007F\u00C0-\u00FF]/.test(text);

const findTypoSuggestion = (
  text: string,
  roster: string[] = [],
  isTitle: boolean = false
): { suggestion: string; confidence: number } | null => {
  const userValue = text.trim();
  if (!userValue || userValue.length < 3) return null;

  const normalizedUser = normalize(userValue);
  const isScriptNonLatin = isNonLatin(userValue);

  const dict = isTitle ? Array.from(new Set([...roster])) : Array.from(new Set([...NAMETAG_DICTIONARY, ...roster]));
  const filteredDict = isScriptNonLatin ? roster.filter((r) => isNonLatin(r)) : dict;

  if (filteredDict.some((word) => normalize(word) === normalizedUser)) {
    const exactMatch = filteredDict.find((word) => word.toUpperCase() === userValue.toUpperCase());
    if (exactMatch && exactMatch !== userValue) return { suggestion: exactMatch.toUpperCase(), confidence: 1 };
    return null;
  }

  let bestMatch: string | null = null;
  let maxConfidence = 0;

  for (const word of filteredDict) {
    const wordUpper = word.toUpperCase();
    const normalizedWord = normalize(wordUpper);
    const dist = getLevenshteinDistance(normalizedUser, normalizedWord);
    const maxLen = Math.max(normalizedUser.length, normalizedWord.length);
    const similarity = 1 - dist / maxLen;

    let isHighConfidence = false;
    const len = normalizedUser.length;

    if (len >= 3 && len <= 5) isHighConfidence = dist === 1 && similarity >= 0.75;
    else if (len >= 6 && len <= 10) isHighConfidence = dist <= 1 && similarity >= 0.85;
    else if (len > 10) isHighConfidence = dist <= 2 && similarity >= 0.8;

    if (isHighConfidence && similarity > maxConfidence) {
      maxConfidence = similarity;
      bestMatch = wordUpper;
    }
  }

  if (bestMatch && maxConfidence >= 0.8) return { suggestion: bestMatch, confidence: maxConfidence };
  return null;
};

// -------------------- Export Helpers --------------------
const waitAssetsReady = async (containerId: string) => {
  const container = document.getElementById(containerId);
  if (!container) return;
  const imgs = Array.from(container.querySelectorAll("img, image")) as (HTMLImageElement | SVGImageElement)[];

  await Promise.all(
    imgs.map(async (img) => {
      if (img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0) return;

      return new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn("Asset timeout", img);
          resolve();
        }, 5000);

        const handleLoad = () => {
          clearTimeout(timeout);
          resolve();
        };

        img.addEventListener("load", handleLoad, { once: true });
        img.addEventListener("error", handleLoad, { once: true });

        const src = img instanceof HTMLImageElement ? img.src : img.getAttribute("href") || img.getAttribute("xlink:href");
        if (src && src.startsWith("data:")) {
          setTimeout(handleLoad, 20);
        }
      });
    })
  );

  // fonts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDoc: any = document;
  if (anyDoc.fonts?.ready) await anyDoc.fonts.ready;
};

function normalizeSvgForInline(svgXml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgXml, "image/svg+xml");
  const svg = doc.documentElement;

  doc.querySelectorAll("script, foreignObject").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    });
  });

  if (!svg.getAttribute("viewBox")) {
    const w = parseFloat(svg.getAttribute("width") || "1000");
    const h = parseFloat(svg.getAttribute("height") || "1000");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  }

  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("style", "width:100%;height:100%;display:block;");

  return new XMLSerializer().serializeToString(svg);
}

const parseCssGradientToSvg = (gradient: string, id: string) => {
  if (!gradient || gradient === "none") return null;
  const match = gradient.match(/linear-gradient\((\d+)deg,\s*(.*)\)/);
  if (!match) return null;

  const angle = parseInt(match[1]);
  const stopsStr = match[2];
  const stops = stopsStr.split(/%,\s*/).map((s) => {
    const parts = s.trim().split(/\s+/);
    const color = parts[0];
    const offset = parts[1] ? parts[1].replace("%", "") + "%" : "0%";
    return { color, offset };
  });

  // Convert angle to SVG coordinates (simplified for common angles like 135deg)
  let x1 = "0%", y1 = "0%", x2 = "100%", y2 = "100%";
  if (angle === 135) { x1 = "0%"; y1 = "0%"; x2 = "100%"; y2 = "100%"; }
  else if (angle === 45) { x1 = "0%"; y1 = "100%"; x2 = "100%"; y2 = "0%"; }
  else if (angle === 90) { x1 = "0%"; y1 = "50%"; x2 = "100%"; y2 = "50%"; }
  else if (angle === 180) { x1 = "50%"; y1 = "0%"; x2 = "50%"; y2 = "100%"; }
  else {
    const angleRad = (angle - 90) * (Math.PI / 180);
    x1 = `${50 - Math.cos(angleRad) * 50}%`;
    y1 = `${50 - Math.sin(angleRad) * 50}%`;
    x2 = `${50 + Math.cos(angleRad) * 50}%`;
    y2 = `${50 + Math.sin(angleRad) * 50}%`;
  }

  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
      {stops.map((stop, i) => (
        <stop key={i} offset={stop.offset} stopColor={stop.color} />
      ))}
    </linearGradient>
  );
};

// -------------------- NametagSvg Component --------------------
const NametagSvg: React.FC<{
  item: NametagItem;
  state: StudioState;
  logoRatio: number;
  isPrint?: boolean;
  id?: string;
  noGradient?: boolean;
  titleWeight?: string;
  logoOverride?: string | null;
  coloredLogoUrl?: string | null;
}> = ({ item, state, logoRatio, isPrint = false, id, noGradient = false, titleWeight = "500", logoOverride, coloredLogoUrl }) => {
  const isCustom = state.shape === ShapeType.CUSTOM && !!state.customShape;
  const style = {
    ...state.globalStyle,
    ...((item as any).overrides || {}),
  };

  const dpi = 100;
  const bW = mmToIn(state.dimensions.width) * dpi;
  const bH = mmToIn(state.dimensions.height) * dpi;
  const rx = state.roundedCorners ? mmToIn(state.cornerRadius) * dpi : 0;

  const isBrushed = (state.material === MaterialFamily.METAL && state.metalFinish.toLowerCase().includes("brossé")) ||
                    (state.material === MaterialFamily.PLASTIC && state.plasticColor.toLowerCase().includes("brossé"));

  const finish = METAL_FINISHES.find((f) => f.name === state.metalFinish) || METAL_FINISHES[0];
  const plastic = PLASTIC_COLORS.find((c) => c.name === state.plasticColor) || PLASTIC_COLORS[0];
  const bgColor = state.material === MaterialFamily.METAL ? finish.bgColor : plastic.bgColor;
  const bgGradient = (state.material === MaterialFamily.METAL && !noGradient) ? finish.gradient : "none";
  const finalNameColor = state.material === MaterialFamily.PLASTIC ? plastic.textColor : style.nameColor;
  const finalTitleColor = state.material === MaterialFamily.PLASTIC ? plastic.textColor : style.titleColor;

  const pad = mmToIn(state.logoMargin) * dpi;
  const gap = state.logo ? state.logoGap : 0;
  const offX = mmToIn(state.logoOffsetX) * dpi;
  const offY = mmToIn(state.logoOffsetY) * dpi;

  const safeW = bW - pad * 2;
  const safeH = bH - pad * 2;

  let lW = 0,
    lH = 0;
  if (state.logo) {
    lW = Math.min(state.logoScale * 0.7, safeW * 0.45);
    lH = lW / (logoRatio || 1);
  }

  const pos = state.logoPos;
  let lx: number, ly: number;
  if (pos.includes("left")) lx = pad;
  else if (pos.includes("right")) lx = bW - pad - lW;
  else lx = (bW - lW) / 2;

  if (pos.includes("top")) ly = pad;
  else if (pos.includes("bottom")) ly = bH - pad - lH;
  else ly = (bH - lH) / 2;

  lx += offX;
  ly += offY;

  const align = style.alignment;
  const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";

  const isRow = state.logo && (pos === "left" || pos === "right");
  const textMaxWidth = isRow ? safeW - lW - gap : safeW;
  const textMaxHeight = isRow ? safeH : state.logo ? safeH - lH - gap : safeH;

  const fit = fitTextToArea(`${item.firstName} ${item.lastName}`, item.title || "", textMaxWidth, textMaxHeight, style);

  const buildSvgTextWithTspans = (
    lines: string[],
    x: number,
    startY: number,
    fontSize: number,
    lineHeight: number,
    fontFamily: string,
    weight: string,
    anchor: string,
    color: string
  ) => {
    const metrics = measureTextCanvas(lines[0] || "", fontFamily, fontSize, weight);
    const baseline = startY + metrics.ascent;

    return (
      <text
        x={x}
        y={baseline}
        fontFamily={`${fontFamily}, Arial, sans-serif`}
        fontSize={fontSize}
        fontWeight={weight}
        textAnchor={anchor}
        fill={color}
      >
        {lines.map((line, idx) => (
          <tspan key={idx} x={x} dy={idx === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    );
  };

  const activeVectorXml = (item as any).vectorLogoXml || (state.isLogoVectorized ? state.vectorLogoXml : null);
  
  const finalVectorXml = useMemo(() => {
    if (activeVectorXml) return activeVectorXml;
    if (state.logo?.startsWith("data:image/svg+xml")) {
      try {
        const base64 = state.logo.split(",")[1];
        return decodeURIComponent(escape(atob(base64)));
      } catch (e) {
        return null;
      }
    }
    return null;
  }, [activeVectorXml, state.logo]);

  const parsedLogo = useMemo(() => finalVectorXml ? parseSvgForInline(finalVectorXml) : null, [finalVectorXml]);

  let tx: number, ty: number;
  if (isRow) {
    tx =
      align === "left"
        ? pos === "left"
          ? lx + lW + gap
          : pad
        : align === "right"
        ? pos === "right"
          ? lx - gap
          : bW - pad
        : pos === "left"
        ? lx + lW + gap + (bW - pad - (lx + lW + gap)) / 2
        : pad + (lx - gap - pad) / 2;

    ty = pad + (safeH - fit.totalH) / 2;
  } else {
    tx = align === "left" ? pad : align === "right" ? bW - pad : bW / 2;

    if (!state.logo) {
      ty = pad + (safeH - fit.totalH) / 2;
    } else {
      if (pos.includes("top")) {
        const availableH = safeH - lH - gap;
        ty = ly + lH + gap + (availableH - fit.totalH) / 2;
      } else if (pos.includes("bottom")) {
        const availableH = safeH - lH - gap;
        ty = pad + (availableH - fit.totalH) / 2;
      } else {
        // Center or other
        const totalStackH = lH + gap + fit.totalH;
        const startY = pad + (safeH - totalStackH) / 2;
        ly = startY;
        ty = startY + lH + gap;
      }
    }
  }

  return (
    <svg
      id={id}
      width={bW}
      height={bH}
      viewBox={`0 0 ${bW} ${bH}`}
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      className="badge-svg-render"
      style={{ display: "block", fontFamily: style.fontFamily }}
    >
      <defs>
        <clipPath id={`clip-${item.id}`} clipPathUnits={isCustom ? "objectBoundingBox" : "userSpaceOnUse"}>
          {isCustom ? (
            <path d={state.customShape?.normalizedPathD} />
          ) : (
            <rect width={bW} height={bH} rx={rx} ry={rx} />
          )}
        </clipPath>
        {bgGradient !== "none" && parseCssGradientToSvg(bgGradient, `grad-${item.id}`)}
        {isBrushed && (
          <filter id={`brushed-${item.id}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.001 0.9" numOctaves="4" result="noise" />
            <feColorMatrix type="saturate" values="0" result="desturatedNoise" />
            <feColorMatrix in="desturatedNoise" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.4 0" result="softNoise" />
            <feBlend in="SourceGraphic" in2="softNoise" mode="multiply" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
        )}
      </defs>
      {parsedLogo?.defs && (
        <defs dangerouslySetInnerHTML={{ __html: parsedLogo.defs }} />
      )}
      <g clipPath={`url(#clip-${item.id})`}>
        <rect 
          width={bW} 
          height={bH} 
          fill={bgGradient !== "none" ? `url(#grad-${item.id})` : bgColor} 
          filter={isBrushed ? `url(#brushed-${item.id})` : undefined}
        />
        {state.background && (
          <image
            x="0"
            y="0"
            width={bW}
            height={bH}
            opacity={state.backgroundOpacity}
            preserveAspectRatio="xMidYMid slice"
            href={state.background}
            xlinkHref={state.background}
            overflow="visible"
          />
        )}

        {state.logo && (
          <g transform={`translate(${lx}, ${ly})`}>
            {logoOverride ? (
              <image 
                x="0" 
                y="0" 
                width={lW} 
                height={lH} 
                href={logoOverride} 
                xlinkHref={logoOverride} 
                preserveAspectRatio="xMidYMid meet" 
                overflow="visible"
              />
            ) : parsedLogo ? (
              <g
                fill={state.material === MaterialFamily.PLASTIC ? plastic.textColor : state.logoColor}
                transform={`scale(${lW / parsedLogo.vbW}, ${lH / parsedLogo.vbH}) translate(${-parsedLogo.vbX}, ${-parsedLogo.vbY})`}
                dangerouslySetInnerHTML={{ __html: parsedLogo.inner }}
              />
            ) : (
              <image 
                x="0" 
                y="0" 
                width={lW} 
                height={lH} 
                href={state.material === MaterialFamily.PLASTIC ? (coloredLogoUrl || state.logo) : state.logo} 
                xlinkHref={state.material === MaterialFamily.PLASTIC ? (coloredLogoUrl || state.logo) : state.logo} 
                preserveAspectRatio="xMidYMid meet" 
                overflow="visible"
              />
            )}
          </g>
        )}

        {buildSvgTextWithTspans(
          fit.nFit.lines,
          tx,
          ty,
          fit.nFit.sz,
          fit.nFit.lh,
          style.fontFamily,
          style.bold ? "900" : "700",
          anchor,
          finalNameColor
        )}
        {buildSvgTextWithTspans(
          fit.tFit.lines,
          tx,
          ty + fit.nFit.bh + 4,
          fit.tFit.sz,
          fit.tFit.lh,
          style.fontFamily,
          titleWeight,
          anchor,
          finalTitleColor
        )}
      </g>
    </svg>
  );
};

// -------------------- App --------------------
const App: React.FC = () => {
  const [state, setState] = useState<StudioState>({
    items: [
      { id: "WVTX0KLF", firstName: "JEAN-SÉBASTIEN", lastName: "TREMBLAY", title: "CHEF DE PROJET", quantity: 1 },
      { id: "HZHKW8V4", firstName: "MARIE", lastName: "TREMBLAY", title: "DESIGNER GRAPHIQUE", quantity: 1 },
    ],
    selectedIndex: 0,
    material: MaterialFamily.METAL,
    shape: ShapeType.STANDARD,
    customShape: null,
    attachment: AttachmentType.MAGNET,
    metalFinish: METAL_FINISHES[0].name,
    metalThickness: "0.020",
    plasticColor: PLASTIC_COLORS[0].name,
    roundedCorners: true,
    cornerRadius: 6.35,
    logo: null,
    logoScale: 80,
    logoPos: "top",
    logoGap: 16,
    logoMargin: 4,
    logoOffsetX: 0,
    logoOffsetY: 0,
    background: null,
    backgroundOpacity: 1,
    globalStyle: { ...DEFAULT_STYLE },
    isSameContent: false,
    dimensions: { width: 76.2, height: 38.1, unit: "in" },
    logoColor: "#000000",
    isLogoVectorized: false,
    vectorLogoXml: null,
    reorderCode: Math.floor(100000 + Math.random() * 900000).toString(),
  });

  const updateState = (updates: Partial<StudioState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const currentItem = useMemo(() => state.items[state.selectedIndex] || state.items[0], [state.items, state.selectedIndex]);

  const [activeTab, setActiveTab] = useState<"product" | "logo" | "style">("product");
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "svg">("pdf");
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [isProcessingRbg, setIsProcessingRbg] = useState(false);

  const [isIndividualMode, setIsIndividualMode] = useState(false);
  const [isVectorizing, setIsVectorizing] = useState(false);
  const [showProof, setShowProof] = useState(false);

  const [widthInput, setWidthInput] = useState(formatDimension(76.2, "in"));
  const [heightInput, setHeightInput] = useState(formatDimension(38.1, "in"));

  const [rawLogoXML, setRawLogoXML] = useState<string | null>(null);
  const [logoRatio, setLogoRatio] = useState<number>(1);

  // IMPORTANT FIX: raster logo to PNG for html2canvas export reliability
  const [exportLogoPng, setExportLogoPng] = useState<string | null>(null);
  const [coloredLogoUrl, setColoredLogoUrl] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('fr');
  const t = translations[language];

  const [customFonts, setCustomFonts] = useState<string[]>([]);
  const fontInputRef = useRef<HTMLInputElement>(null);

  const handleFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fontName = `Custom-${file.name.split(".")[0]}`;
    const fontUrl = URL.createObjectURL(file);

    const fontFace = new FontFace(fontName, `url(${fontUrl})`);
    fontFace
      .load()
      .then((loadedFace) => {
        document.fonts.add(loadedFace);
        setCustomFonts((prev) => [...prev, fontName]);
        updateStyleSetting({ fontFamily: fontName });
      })
      .catch((err) => {
        console.error("Font load error:", err);
        alert("Erreur lors du chargement de la police.");
      });
  };

  const getFinishTranslation = (name: string) => {
    const map: { [key: string]: string } = {
      'Argent Brossé': t.argentBrosse,
      'Or Brossé': t.orBrosse,
      'Cuivre Brossé': t.cuivreBrosse,
      'Blanc Sublimation': t.blancSublimation,
    };
    return map[name] || name;
  };

  // -------------------- Magento Integration --------------------
  const calculateTotalPrice = () => {
    let base = state.material === MaterialFamily.METAL ? PRICING.METAL_BASE : PRICING.PLASTIC_BASE;
    if (state.shape === ShapeType.CUSTOM) base += PRICING.CUSTOM_SHAPE_EXTRA;
    if (state.attachment === AttachmentType.MAGNET) base += PRICING.MAGNET_EXTRA;
    
    const count = state.items.length;
    let total = base * count;
    
    // Apply volume discounts
    const discount = PRICING.DISCOUNTS.find(d => count >= d.min && count <= d.max);
    if (discount) {
      total = total * (1 - discount.rate);
    }
    
    return total;
  };

  // -------------------- Export Helpers --------------------
  const normalizeAssetToDataUrl = async (url: string | null): Promise<string | null> => {
    if (!url) return null;
    if (url.startsWith("data:")) return url;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn("[EXPORT] Asset normalization failed for", url, e);
      return url;
    }
  };

  const buildExportSnapshot = async () => {
    const logoData = await normalizeAssetToDataUrl(coloredLogoUrl || state.logo);
    const backgroundData = await normalizeAssetToDataUrl(state.background);

    return {
      meta: {
        unit: state.dimensions.unit,
        dpi: 72,
        timestamp: Date.now(),
      },
      items: state.items.map((item) => ({
        id: item.id,
        firstName: item.firstName,
        lastName: item.lastName,
        title: item.title,
        style: getActiveStyle(item),
      })),
      settings: {
        dimensions: state.dimensions,
        cornerRadius: state.cornerRadius,
        roundedCorners: state.roundedCorners,
        logo: {
          data: logoData,
          scale: state.logoScale,
          gap: state.logoGap,
          margin: state.logoMargin,
          offsetX: state.logoOffsetX,
          offsetY: state.logoOffsetY,
          pos: state.logoPos,
          ratio: logoRatio,
        },
        background: {
          data: backgroundData,
          opacity: state.backgroundOpacity,
        },
        material: state.material,
        metalFinish: state.metalFinish,
        plasticColor: state.plasticColor,
      },
    };
  };

  const handleAddToCart = async () => {
    setIsExporting(true);
    try {
      // 1. Générer le PDF en arrière-plan (sans le télécharger)
      const snapshot = await buildExportSnapshot();
      const wasProofShowing = showProof;
      if (!wasProofShowing) {
        setShowProof(true);
        await new Promise(r => setTimeout(r, 1000));
      }
      
      await waitAssetsReady("bat-grid-container");
      const container = document.getElementById("bat-grid-container");
      const items = container?.querySelectorAll('.badge-render') || [];
      
      const doc = new jsPDF({ orientation: 'p', unit: 'in', format: 'a4' });
      const badgeW = mmToIn(snapshot.settings.dimensions.width);
      const badgeH = mmToIn(snapshot.settings.dimensions.height);
      const margin = 0.5;
      let xPos = margin;
      let yPos = margin;

      const h2c = (window as any).html2canvas;
      for (let i = 0; i < snapshot.items.length; i++) {
        const el = document.getElementById(`badge-print-${snapshot.items[i].id}`);
        if (!el) continue;
        const canvas = await h2c(el, { scale: 3, useCORS: true, logging: false });
        const imgData = canvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', xPos, yPos, badgeW, badgeH);
        xPos += badgeW + margin;
        if (xPos + badgeW > 7.8) { xPos = margin; yPos += badgeH + margin; if (yPos + badgeH > 10.5 && i < snapshot.items.length - 1) { doc.addPage(); yPos = margin; } }
      }

      // 2. Récupérer le PDF en format Base64
      const pdfBase64 = doc.output('datauristring');

      // 3. Préparer le message pour Magento
      const totalPrice = calculateTotalPrice();
      const data = {
        type: 'WETAG_ADD_TO_CART',
        payload: {
          sku: 'BADGE-NATIVE',
          qty: state.items.length,
          price: (totalPrice / state.items.length).toFixed(2),
          totalPrice: totalPrice.toFixed(2), // On garde le format 26.98
          fileData: pdfBase64,
          fileName: `badge_config_${Date.now()}.pdf`,
          options: {
            'Configuration': `Matériau: ${state.material}, Finition: ${state.material === MaterialFamily.METAL ? state.metalFinish : state.plasticColor}`,
            'Liste des noms': state.items.map(i => `${i.firstName} ${i.lastName}`).join(' | ')
          }
        }
      };

      if (window.parent !== window) {
        window.parent.postMessage(data, '*');
      } else {
        console.log("Magento Data:", data);
        alert("Mode démo : Fichier généré et prêt à être envoyé.");
      }

      if (!wasProofShowing) setShowProof(false);
    } catch (err) {
      console.error("Erreur lors de la préparation du panier", err);
      alert("Erreur lors de la préparation des fichiers.");
    } finally {
      setIsExporting(false);
    }
  };

  const activeErrorsCount = useMemo(() => {
    let count = 0;
    invalidIds.forEach((id) => {
      if (!acceptedIds.has(id)) count++;
    });
    return count;
  }, [invalidIds, acceptedIds]);

  useEffect(() => {
    setWidthInput(formatDimension(state.dimensions.width, state.dimensions.unit));
    setHeightInput(formatDimension(state.dimensions.height, state.dimensions.unit));
  }, [state.dimensions.unit, state.dimensions.width, state.dimensions.height]);

  // Helper: rasterize any logo src (svg/png data url) to PNG data url
  const rasterizeToPngDataUrl = async (src: string, maxW = 1600) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Logo load failed"));
    });

    // Some browsers: decode helps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyImg: any = img;
    if (typeof anyImg.decode === "function") {
      try {
        await anyImg.decode();
      } catch {
        // ignore
      }
    }

    const ratio = img.width / img.height || 1;
    const w = Math.min(maxW, img.width || maxW);
    const h = Math.max(1, Math.round(w / ratio));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas ctx failed");
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    return canvas.toDataURL("image/png");
  };

  // Build exportLogoPng when logo changes (or vector color changes)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const logoToRasterize = state.material === MaterialFamily.PLASTIC ? coloredLogoUrl : state.logo;
        if (!logoToRasterize) {
          setExportLogoPng(null);
          return;
        }
        const png = await rasterizeToPngDataUrl(logoToRasterize, 1600);
        if (!cancelled) setExportLogoPng(png);
      } catch (e) {
        console.warn("[exportLogoPng] rasterize failed", e);
        if (!cancelled) setExportLogoPng(state.logo); // fallback
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [state.logo, state.vectorLogoXml, state.logoColor, state.material, coloredLogoUrl]);

  const rosterData = useMemo(() => {
    const firstNames = Array.from(new Set(state.items.map((i) => i.firstName).filter((v) => v)));
    const lastNames = Array.from(new Set(state.items.map((i) => i.lastName).filter((v) => v)));
    const titles = Array.from(new Set(state.items.map((i) => i.title).filter((v) => v)));
    return { firstNames, lastNames, titles };
  }, [state.items]);

  const recolorSvg = (svgXml: string, color: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgXml, "image/svg+xml");
    const svg = doc.documentElement;
    svg.setAttribute("fill", color);
    const elements = doc.querySelectorAll("path, rect, circle, ellipse, polygon, polyline, text");
    elements.forEach((el) => {
      const fill = el.getAttribute("fill");
      const stroke = el.getAttribute("stroke");
      if (fill && fill !== "none") el.setAttribute("fill", color);
      if (stroke && stroke !== "none") el.setAttribute("stroke", color);
      const style = el.getAttribute("style");
      if (style) {
        const newStyle = style.replace(/fill:[^;]+/g, `fill:${color}`).replace(/stroke:[^;]+/g, `stroke:${color}`);
        el.setAttribute("style", newStyle);
      }
    });
    return new XMLSerializer().serializeToString(doc);
  };

  useEffect(() => {
    if (!state.logo) {
      setColoredLogoUrl(null);
      return;
    }

    if (state.material !== MaterialFamily.PLASTIC) {
      setColoredLogoUrl(state.logo);
      return;
    }

    const plastic = PLASTIC_COLORS.find((c) => c.name === state.plasticColor) || PLASTIC_COLORS[0];
    const targetColor = plastic.textColor;

    let isMounted = true;

    const recolor = async () => {
      try {
        if (state.logo!.startsWith("data:image/svg+xml")) {
          const base64 = state.logo!.split(",")[1];
          const xml = decodeURIComponent(escape(atob(base64)));
          const newXml = recolorSvg(xml, targetColor);
          const newUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(newXml)));
          if (isMounted) setColoredLogoUrl(newUrl);
        } else {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = state.logo!;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(img, 0, 0);
          ctx.globalCompositeOperation = "source-in";
          ctx.fillStyle = targetColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          if (isMounted) setColoredLogoUrl(canvas.toDataURL("image/png"));
        }
      } catch (e) {
        console.error("Failed to recolor logo", e);
        if (isMounted) setColoredLogoUrl(state.logo);
      }
    };

    recolor();

    return () => {
      isMounted = false;
    };
  }, [state.logo, state.material, state.plasticColor]);

  function applyLogoFilters(svgXml: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgXml, "image/svg+xml");
    const svg = doc.documentElement;
    svg.setAttribute("fill", "currentColor");
    const elements = doc.querySelectorAll("rect, path, circle, polygon, ellipse");
    elements.forEach((el) => {
      const fill = el.getAttribute("fill");
      const stroke = el.getAttribute("stroke");
      if (fill && fill !== "none") el.setAttribute("fill", "currentColor");
      if (stroke && stroke !== "none") el.setAttribute("stroke", "currentColor");
      el.removeAttribute("style");
    });
    const finalXml = new XMLSerializer().serializeToString(doc);
    setRawLogoXML(finalXml);
    return finalXml;
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const isVector = file.type === "image/svg+xml";

    if (file.name.toLowerCase().endsWith(".ai") || file.name.toLowerCase().endsWith(".pdf")) {
      alert("La conversion directe des fichiers PDF/AI n'est pas configurée. Veuillez utiliser un format SVG ou PNG.");
      return;
    }

    if (isVector) {
      reader.onload = (re) => {
        const xml = re.target?.result as string;
        const filteredXml = normalizeSvgForInline(applyLogoFilters(xml));
        const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(filteredXml)));
        const img = new Image();
        img.onload = () => {
          setLogoRatio(img.width / img.height || 1);
          updateState({ logo: dataUrl, isLogoVectorized: true, vectorLogoXml: filteredXml });
        };
        img.src = dataUrl;
      };
      reader.readAsText(file);
    } else {
      reader.onload = (re) => {
        const result = re.target?.result as string;
        const img = new Image();
        img.onload = () => {
          setLogoRatio(img.width / img.height || 1);
          updateState({ logo: result, isLogoVectorized: false, vectorLogoXml: null });
          setRawLogoXML(null);
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCustomShapeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type === "image/svg+xml") {
      const reader = new FileReader();
      reader.onload = (re) => {
        const xml = re.target?.result as string;
        const doc = new DOMParser().parseFromString(xml, "image/svg+xml");
        const result = selectCutlineFromSvg(doc);
        if (!result) {
          alert("Impossible d'extraire un contour fermé.");
          return;
        }
        updateState({
          customShape: {
            sourceType: "svg",
            outlinePathD: result.d,
            normalizedPathD: normalizePathData(result.d, result.viewBox),
            viewBox: result.viewBox,
            originalAspect: result.viewBox.w / result.viewBox.h,
          },
          shape: ShapeType.CUSTOM,
        });
      };
      reader.readAsText(file);
    } else if (file.type === "application/pdf") {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        // @ts-ignore - pdfjs-dist types can be tricky
        await page.render({ canvasContext: context, viewport }).promise;
        const d = traceImageOutline(canvas);
        updateState({
          customShape: {
            sourceType: "raster",
            outlinePathD: d,
            normalizedPathD: normalizePathData(d, { minX: 0, minY: 0, w: canvas.width, h: canvas.height }),
            viewBox: { minX: 0, minY: 0, w: canvas.width, h: canvas.height },
            originalAspect: canvas.width / canvas.height,
          },
          shape: ShapeType.CUSTOM,
        });
      } catch (err) {
        console.error("Error loading PDF for shape:", err);
        alert("Erreur lors de l'import du PDF pour la forme.");
      }
    } else if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (re) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(img, 0, 0);
          const d = traceImageOutline(canvas);
          updateState({
            customShape: {
              sourceType: "raster",
              outlinePathD: d,
              normalizedPathD: normalizePathData(d, { minX: 0, minY: 0, w: img.width, h: img.height }),
              viewBox: { minX: 0, minY: 0, w: img.width, h: img.height },
              originalAspect: img.width / img.height,
            },
            shape: ShapeType.CUSTOM,
          });
        };
        img.src = re.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // mark logo as locked when user tweaks it
  const updateLogoState = (updates: Partial<StudioState>) => {
    updateState(updates);
    const newItems = [...state.items];
    const item = { ...newItems[state.selectedIndex], logoLocked: true } as any;
    newItems[state.selectedIndex] = item;
    setState((prev) => ({ ...prev, items: newItems }));
  };

  // -------------------- VECTORIZATION (your original logic) --------------------
  const normalizeAnyLogoInputToPngDataUrl = async (src: string | null): Promise<string> => {
    if (!src) throw new Error("No source logo provided");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    const canvas = document.createElement("canvas");
    const maxSide = 2000;
    let w = img.width;
    let h = img.height;
    if (w > maxSide || h > maxSide) {
      if (w > h) {
        h = (maxSide / w) * h;
        w = maxSide;
      } else {
        w = (maxSide / h) * w;
        h = maxSide;
      }
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas init failed");
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  };

  const tracePngToVectorSvgPaths = async (pngDataUrl: string): Promise<string> => {
    const img = new Image();
    img.src = pngDataUrl;
    await new Promise((resolve) => (img.onload = resolve));
    const canvas = document.createElement("canvas");
    const size = 300;
    canvas.width = size;
    canvas.height = Math.round(size * (img.height / img.width));
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    let pathData = "";
    const w = canvas.width;
    const h = canvas.height;

    for (let y = 0; y < h; y++) {
      let startX = -1;
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const alpha = data[idx + 3];
        const luminance = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        const isSolid = alpha > 128 && luminance < 160;

        if (isSolid && startX === -1) startX = x;
        if (!isSolid && startX !== -1) {
          pathData += `M${startX},${y}h${x - startX}v1h-${x - startX}z `;
          startX = -1;
        }
      }
      if (startX !== -1) pathData += `M${startX},${y}h${w - startX}v1h-${w - startX}z `;
    }

    if (!pathData) throw new Error("Vectorize produced no paths");
    return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="${pathData.trim()}" /></svg>`;
  };

  const sanitizeAndNormalizeVectorSvg = (svgText: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svgEl = doc.documentElement;
    svgEl.querySelectorAll("image").forEach((i) => i.remove());
    if (svgEl.querySelectorAll("path, rect, circle, polygon, ellipse").length === 0) throw new Error("SVG is empty after cleanup");

    const vb = svgEl.getAttribute("viewBox")?.split(/\s+|,/).map(Number);
    if (!vb || vb.length < 4) svgEl.setAttribute("viewBox", "0 0 100 100");

    svgEl.querySelectorAll("path, rect, circle, polygon, ellipse").forEach((p) => {
      const fill = p.getAttribute("fill");
      if (fill && fill !== "none") p.setAttribute("fill", "currentColor");
      p.removeAttribute("style");
    });

    return new XMLSerializer().serializeToString(doc);
  };

  const getTargetItemIds = (): string[] => {
    if (state.isSameContent) return state.items.map((i) => i.id);
    return [currentItem.id];
  };

  const commitVectorLogoToItem = (id: string, svgText: string) => {
    setState((prev) => {
      const newItems = prev.items.map((item) => {
        if (item.id === id) {
          return {
            ...(item as any),
            logoVersion: "vector" as const,
            vectorLogoXml: svgText,
            isVectorizing: false,
          };
        }
        return item;
      });
      return {
        ...prev,
        items: newItems,
        isLogoVectorized: true,
        vectorLogoXml: svgText,
      };
    });
  };

  const handleVectorizeLogo = async () => {
    if (!state.logo || isVectorizing) return;

    const targetItemIds = getTargetItemIds();
    if (targetItemIds.length === 0) {
      alert("Veuillez sélectionner un badge.");
      return;
    }

    setIsVectorizing(true);

    try {
      for (const id of targetItemIds) {
        const pngDataUrl = await normalizeAnyLogoInputToPngDataUrl(state.logo);
        const rawSvgText = await tracePngToVectorSvgPaths(pngDataUrl);
        const cleanSvgText = sanitizeAndNormalizeVectorSvg(rawSvgText);
        commitVectorLogoToItem(id, cleanSvgText);

        // also refresh export png (since state.logo might still be svg)
        try {
          const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(normalizeSvgForInline(cleanSvgText))));
          const png = await rasterizeToPngDataUrl(dataUrl, 1600);
          setExportLogoPng(png);
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      console.error("[VECTORIZE] failed", err);
      alert("Vectorize failed: " + err.message);
    } finally {
      setIsVectorizing(false);
    }
  };

  const handleLogoColorChange = (color: string) => {
    if (!state.vectorLogoXml) return;
    const newXml = recolorSvg(state.vectorLogoXml, color);
    const newDataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(newXml)));
    updateLogoState({ logoColor: color, vectorLogoXml: newXml, logo: newDataUrl });

    const newItems = [...state.items];
    newItems[state.selectedIndex] = { ...(newItems[state.selectedIndex] as any), vectorLogoXml: newXml };
    updateState({ items: newItems });
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (re) => {
      updateState({ background: re.target?.result as string });
      // Reset input value to allow re-uploading the same file if needed
      e.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const removeLogoBackground = () => {
    if (rawLogoXML) {
      const dataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(rawLogoXML)));
      updateState({ logo: dataUrl });
    } else {
      updateState({ logo: null });
    }
  };

  async function handleRemoveBgAndFit() {
    if (!state.logo || isProcessingRbg) return;
    setIsProcessingRbg(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = state.logo;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas context failed");
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      const bg = { r: data[0], g: data[1], b: data[2] };
      const threshold = 40;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2];
        const diff = Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b);
        if (diff < threshold) data[i + 3] = 0;
      }
      ctx.putImageData(imageData, 0, 0);

      let minX = canvas.width,
        minY = canvas.height,
        maxX = 0,
        maxY = 0;
      const alphaThreshold = 8;
      let foundPixels = false;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const alpha = data[(y * canvas.width + x) * 4 + 3];
          if (alpha > alphaThreshold) {
            foundPixels = true;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (!foundPixels) throw new Error("No visible pixels found after removal");

      const padding = 4;
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(canvas.width, maxX + padding);
      maxY = Math.min(canvas.height, maxY + padding);

      const cropW = Math.max(1, maxX - minX);
      const cropH = Math.max(1, maxY - minY);

      const fittedCanvas = document.createElement("canvas");
      fittedCanvas.width = cropW;
      fittedCanvas.height = cropH;
      const fittedCtx = fittedCanvas.getContext("2d");
      if (!fittedCtx) throw new Error("Fitted context failed");
      fittedCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

      const fittedPngDataUrl = fittedCanvas.toDataURL("image/png");
      updateLogoState({ logo: fittedPngDataUrl, isLogoVectorized: false, vectorLogoXml: null });
      setLogoRatio(cropW / cropH);

      // refresh export png
      setExportLogoPng(fittedPngDataUrl);
    } catch (err) {
      console.error("[RBG+FIT] failed", err);
      alert("Remove BG failed: " + (err instanceof Error ? err.message : "Error"));
    } finally {
      setIsProcessingRbg(false);
    }
  }

  // -------------------- Styles / Items --------------------
  const getActiveStyle = (item: NametagItem): TagStyle => ({
    ...state.globalStyle,
    ...((item as any).overrides || {}),
  });

  const triggerTypoCheck = (item: NametagItem): NametagItem => {
    const suggestions: any = { ...(item as any).typoSuggestions };
    const fieldsToCheck: ("firstName" | "lastName" | "title")[] = ["firstName", "lastName", "title"];
    for (const field of fieldsToCheck) {
      const currentVal = (item as any)[field] || "";
      const roster =
        field === "firstName" ? rosterData.firstNames : field === "lastName" ? rosterData.lastNames : rosterData.titles;

      const res = findTypoSuggestion(currentVal, roster, field === "title");
      if (res && (!suggestions[field] || suggestions[field].suggestion !== res.suggestion)) {
        suggestions[field] = { original: currentVal, suggestion: res.suggestion, confidence: res.confidence, dismissed: false };
      } else if (!res) {
        delete suggestions[field];
      }
    }
    return { ...(item as any), typoSuggestions: suggestions } as NametagItem;
  };

  const updateCurrentItem = (updates: Partial<NametagItem>) => {
    const newItems = [...state.items];
    let updatedItem = { ...(newItems[state.selectedIndex] as any), ...updates } as NametagItem;
    updatedItem = triggerTypoCheck(updatedItem);
    newItems[state.selectedIndex] = updatedItem;
    updateState({ items: newItems });
  };

  const applyTypoSuggestion = (field: "firstName" | "lastName" | "title", suggestion: string) => {
    const newItems = [...state.items];
    const item: any = { ...(newItems[state.selectedIndex] as any) };
    item[field] = suggestion;
    if (item.typoSuggestions) delete item.typoSuggestions[field];
    const updatedWithCheck = triggerTypoCheck(item);
    newItems[state.selectedIndex] = updatedWithCheck;
    updateState({ items: newItems });
  };

  const ignoreTypoSuggestion = (field: "firstName" | "lastName" | "title") => {
    const newItems = [...state.items];
    const item: any = { ...(newItems[state.selectedIndex] as any) };
    if (item.typoSuggestions && item.typoSuggestions[field]) {
      item.typoSuggestions[field] = { ...item.typoSuggestions[field], dismissed: true };
    }
    newItems[state.selectedIndex] = item;
    updateState({ items: newItems });
  };

  const updateStyleSetting = (updates: Partial<TagStyle>) => {
    if (isIndividualMode) {
      updateCurrentItem({ overrides: { ...getActiveStyle(currentItem), ...updates } } as any);
    } else {
      updateState({ globalStyle: { ...state.globalStyle, ...updates } });
    }
  };

  const addItem = () => {
    const newItem: NametagItem = {
      id: Math.random().toString(36).substr(2, 8).toUpperCase(),
      firstName: "PRÉNOM",
      lastName: "NOM",
      title: "Titre / Poste",
      quantity: 1,
    };
    updateState({ items: [...state.items, newItem], selectedIndex: state.items.length });
  };

  const handleDimensionChange = (key: "width" | "height", val: string) => {
    if (key === "width") setWidthInput(val);
    else setHeightInput(val);
    const mmValue = parseUserDimension(val, state.dimensions.unit);
    updateState({ dimensions: { ...state.dimensions, [key]: mmValue } });
  };

  // -------------------- QC --------------------
  const handleQCChange = (id: string, isValid: boolean) => {
    setInvalidIds((prev) => {
      const next = new Set(prev);
      if (isValid) {
        if (next.has(id)) {
          next.delete(id);
          return next;
        }
        return prev;
      } else {
        if (!next.has(id)) {
          next.add(id);
          return next;
        }
        return prev;
      }
    });
  };

  // -------------------- Import --------------------
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "model"; text: string }[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const aiChatRef = useRef<HTMLDivElement>(null);

  const handleAiChat = async () => {
    if (!aiInput.trim() || isAiLoading) return;

    const userMsg = aiInput.trim();
    setAiInput("");
    setAiMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setIsAiLoading(true);

    try {
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${t.aiSystemPrompt}
                - Material: ${state.material === MaterialFamily.METAL ? "Metal (" + state.metalFinish + ")" : "Plastic (" + state.plasticColor + ")"}
                - Shape: ${state.shape === ShapeType.STANDARD ? "Standard" : "Custom"}
                - Dimensions: ${state.dimensions.width}x${state.dimensions.height} ${state.dimensions.unit}
                - Attachment: ${state.attachment === AttachmentType.MAGNET ? "Magnet" : "Pin"}
                - Items count: ${state.items.length}
                - Current badge: ${currentItem.firstName} ${currentItem.lastName} (${currentItem.title})`,
              },
              ...aiMessages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
              { role: "user", parts: [{ text: userMsg }] },
            ],
          },
        ],
      });

      const response = await model;
      const text = response.text || t.aiError;
      setAiMessages((prev) => [...prev, { role: "model", text }]);
    } catch (error) {
      console.error("AI Error:", error);
      setAiMessages((prev) => [...prev, { role: "model", text: t.aiCommunicationError }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    if (aiChatRef.current) {
      aiChatRef.current.scrollTop = aiChatRef.current.scrollHeight;
    }
  }, [aiMessages]);

  const [importData, setImportData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<{ [key: string]: any }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shapeInputRef = useRef<HTMLInputElement>(null);
  const [pasteValue, setPasteValue] = useState("");

  const handleFileUploadSpreadsheet = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      setImportData(data);
    };
    reader.readAsBinaryString(file);
  };

  const handlePasteImport = () => {
    if (!pasteValue.trim()) return;
    const lines = pasteValue.split("\n").filter((l) => l.trim());
    const data = lines.map((line) => {
      const parts = line.split(/[—|,|-]/).map((s) => s.trim());
      const nameParts = (parts[0] || "").split(" ");
      return [nameParts[0] || "", nameParts.slice(1).join(" "), parts[1] || ""];
    });
    setImportData([["Prénom", "Nom", "Titre"], ...data]);
    setMapping({ firstName: 0, lastName: 1, title: 2 });
  };

  const finalizeImport = () => {
    const rows = importData.slice(1);
    let newItems = rows.map((row: any) => ({
      id: Math.random().toString(36).substr(2, 8).toUpperCase(),
      firstName: String(row[mapping.firstName] || "").toUpperCase(),
      lastName: String(row[mapping.lastName] || "").toUpperCase(),
      title: String(row[mapping.title] || ""),
      quantity: 1,
    }));
    newItems = newItems.map((item: any) => triggerTypoCheck(item));
    updateState({ items: [...state.items, ...(newItems as any)], selectedIndex: state.selectedIndex });
    setIsImportModalOpen(false);
    setImportData([]);
  };

  // -------------------- PDF Export (Unified with SVG) --------------------
  const drawWetagWatermark = (doc: jsPDF) => {
    if (typeof doc.saveGraphicsState === "function") doc.saveGraphicsState();
    try {
      // @ts-ignore
      if (doc.GState) {
        // @ts-ignore
        doc.setGState(new doc.GState({ opacity: 0.04 }));
      }
    } catch (e) {}
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(0, 100, 150);
    
    const text = "Wetag ";
    const textWidth = doc.getTextWidth(text) || 1;
    const stepX = textWidth * 1.5;
    const stepY = 0.4;
    
    for (let py = -0.5; py < 11.5; py += stepY) {
      const row = Math.floor(py / stepY);
      for (let px = -1; px < 9.5; px += stepX) {
        doc.text(text, px + (row % 2 === 0 ? 0 : stepX / 2), py, { angle: -20 });
      }
    }
    
    if (typeof doc.restoreGraphicsState === "function") doc.restoreGraphicsState();
  };

  const drawWetagPatternBar = (doc: jsPDF, y: number, height: number) => {
    doc.setFillColor(0, 100, 150);
    doc.rect(0, y, 8.5, height, "F");
    
    // Watermark pattern
    doc.setTextColor(255, 255, 255);
    // @ts-ignore
    if (doc.GState) {
      // @ts-ignore
      doc.saveGraphicsState();
      // @ts-ignore
      doc.setGState(new doc.GState({ opacity: 0.1 }));
    }
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(30);
    for (let i = -1; i < 10; i++) {
      doc.text("Wetag", i * 1.5, y + height / 2 + 0.1, { angle: 15 });
    }
    
    // @ts-ignore
    if (doc.restoreGraphicsState) {
      // @ts-ignore
      doc.restoreGraphicsState();
    }
  };

  const drawPageNumber = (doc: jsPDF, pageNum: number, totalPages: number) => {
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(`${t.pdfPage} ${pageNum} / ${totalPages}`, 4.25, 10.4, { align: "center" });
  };

  const drawPageDimensions = (doc: jsPDF) => {
    const width = 8.5;
    const height = 11;
    const x = width - 0.8;
    const y = height - 0.8;
    
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.005);
    
    // Horizontal arrow
    doc.line(x, y, x + 0.4, y);
    doc.line(x, y, x + 0.06, y - 0.04);
    doc.line(x, y, x + 0.06, y + 0.04);
    
    // Vertical arrow
    doc.line(x + 0.5, y - 0.1, x + 0.5, y - 0.5);
    doc.line(x + 0.5, y - 0.5, x + 0.46, y - 0.44);
    doc.line(x + 0.5, y - 0.5, x + 0.54, y - 0.44);
    
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.text("8.5’’", x + 0.2, y + 0.15, { align: "center" });
    doc.text("11’’", x + 0.65, y - 0.3, { angle: 90, align: "center" });
    
    // Add corner lines
    doc.line(x + 0.5, y, x + 0.5, y + 0.1);
    doc.line(x + 0.4, y, x + 0.5, y);
  };

  const getBase64Image = (url: string, maxWidth = 400): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.6));
        } else {
          reject(new Error('Could not get canvas context'));
        }
      };
      img.onerror = (err) => reject(err);
      img.src = url;
    });
  };

  const drawWetagHeader = async (doc: jsPDF, reorderCode: string) => {
    const startY = 1.3;
    
    try {
      // Try to load images
      const [logoBase64, sealBase64] = await Promise.all([
        getBase64Image('/logo.png').catch(() => null),
        getBase64Image('/seal.png').catch(() => null)
      ]);

      if (logoBase64) {
        // Logo Wetag (using the uploaded image)
        doc.addImage(logoBase64, 'JPEG', 0.75, startY - 0.25, 2.4, 0.8, undefined, 'SLOW');
      } else {
        // Fallback to manual drawing if image fails
        const logoX = 1.2;
        const logoY = startY + 0.25;
        // Blue box for W
        doc.setFillColor(0, 100, 150);
        doc.rect(logoX, startY - 0.22, 0.55, 0.55, "F");
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(38);
        doc.setTextColor(255, 255, 255);
        doc.text("W", logoX + 0.04, logoY - 0.02);
        
        // "e" in blue
        doc.setTextColor(0, 100, 150);
        doc.setFontSize(52);
        doc.text("e", logoX + 0.58, logoY + 0.05);
        
        // "tag" in red
        doc.setTextColor(220, 50, 50);
        doc.text("tag", logoX + 0.88, logoY + 0.05);
        
        // Trademark symbol
        doc.setFontSize(10);
        doc.text("®", logoX + 0.88 + doc.getTextWidth("tag") + 0.02, startY - 0.05);
      }

      if (sealBase64) {
        // Canadian Seal (using the uploaded image)
        doc.addImage(sealBase64, 'JPEG', 3.8, startY - 0.3, 0.9, 0.9, undefined, 'SLOW');
      } else {
        // Fallback to manual drawing
        const sealX = 4.2;
        const sealY = startY + 0.1;
        doc.setDrawColor(220, 50, 50);
        doc.setLineWidth(0.02);
        doc.circle(sealX, sealY, 0.48, "S");
        doc.setLineWidth(0.01);
        doc.circle(sealX, sealY, 0.42, "S");
        const drawCurvedText = (text: string, centerX: number, centerY: number, radius: number, startAngle: number, isTop: boolean) => {
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(6);
          doc.setTextColor(220, 50, 50);
          const chars = text.split("");
          const totalAngle = 90;
          const step = totalAngle / (chars.length - 1);
          chars.forEach((char, i) => {
            const angle = startAngle + (isTop ? 1 : -1) * (i * step - totalAngle / 2);
            const rad = (angle * Math.PI) / 180;
            const x = centerX + radius * Math.cos(rad);
            const y = centerY + radius * Math.sin(rad);
            const charRotation = angle + 90;
            doc.text(char, x, y, { align: "center", angle: charRotation });
          });
        };
        drawCurvedText("ORIGINAL", sealX, sealY, 0.36, -90, true);
        drawCurvedText("ORIGINAL", sealX, sealY, 0.36, 90, false);

        // Simple stars instead of emojis to avoid encoding issues in jsPDF
        doc.setFontSize(8);
        doc.text("*", sealX - 0.15, sealY - 0.15, { align: "center" });
        doc.text("*", sealX + 0.15, sealY - 0.15, { align: "center" });
        doc.text("*", sealX, sealY - 0.25, { align: "center" });
        doc.text("*", sealX - 0.15, sealY + 0.25, { align: "center" });
        doc.text("*", sealX + 0.15, sealY + 0.25, { align: "center" });

        // Blue Ribbon
        doc.setFillColor(0, 100, 150);
        // Ribbon polygon
        const ribY = sealY - 0.1;
        const ribH = 0.25;
        doc.triangle(sealX - 0.6, ribY, sealX - 0.6, ribY + ribH, sealX - 0.45, ribY + ribH/2, "F");
        doc.triangle(sealX + 0.6, ribY, sealX + 0.6, ribY + ribH, sealX + 0.45, ribY + ribH/2, "F");
        doc.rect(sealX - 0.5, ribY, 1.0, ribH, "F");
        
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);
        doc.setFont("Helvetica", "bold");
        doc.text("100% Canadian", sealX, ribY + 0.17, { align: "center", angle: -10 });
      }
    } catch (error) {
      console.error("Error loading images for PDF:", error);
    }
    
    // Reorder Code Box
    doc.setDrawColor(0, 100, 150);
    doc.setLineWidth(0.01);
    doc.rect(6.8, startY - 0.3, 1.4, 0.9, "S");
    doc.setFontSize(9);
    doc.setTextColor(0, 100, 150);
    doc.setFont("Helvetica", "normal");
    doc.text("REORDER CODE *:", 6.9, startY - 0.1);
    doc.setFontSize(14);
    doc.text(reorderCode, 6.9, startY + 0.2);
  };

  const drawDimensionLine = (doc: jsPDF, x1: number, y1: number, x2: number, y2: number, label: string, isVertical: boolean = false, showArrows: boolean = true, textPos?: 'top' | 'bottom' | 'left' | 'right') => {
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.005);
    doc.setLineDashPattern([0.05, 0.05], 0);
    doc.line(x1, y1, x2, y2);
    
    // Reset dash for ticks and arrows
    doc.setLineDashPattern([], 0);
    
    // Tick marks
    const tickSize = 0.05;
    if (isVertical) {
      doc.line(x1 - tickSize, y1, x1 + tickSize, y1);
      doc.line(x2 - tickSize, y2, x2 + tickSize, y2);
    } else {
      doc.line(x1, y1 - tickSize, x1, y1 + tickSize);
      doc.line(x2, y2 - tickSize, x2, y2 + tickSize);
    }
    
    if (showArrows) {
      const arrowSize = 0.06;
      if (isVertical) {
        doc.line(x1, y1, x1 - arrowSize/2, y1 + arrowSize);
        doc.line(x1, y1, x1 + arrowSize/2, y1 + arrowSize);
        doc.line(x2, y2, x2 - arrowSize/2, y2 - arrowSize);
        doc.line(x2, y2, x2 + arrowSize/2, y2 - arrowSize);
      } else {
        doc.line(x1, y1, x1 + arrowSize, y1 - arrowSize/2);
        doc.line(x1, y1, x1 + arrowSize, y1 + arrowSize/2);
        doc.line(x2, y2, x2 - arrowSize, y2 - arrowSize/2);
        doc.line(x2, y2, x2 - arrowSize, y2 + arrowSize/2);
      }
    }
    
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    
    const pos = textPos || (isVertical ? 'left' : 'top');
    let textX = (x1 + x2) / 2;
    let textY = (y1 + y2) / 2;
    
    if (pos === 'top') textY = y1 - 0.2;
    if (pos === 'bottom') textY = y1 + 0.2;
    if (pos === 'left') textX = x1 - 0.2;
    if (pos === 'right') textX = x1 + 0.2;
    
    if (isVertical) {
      doc.text(label, textX, textY, { angle: 90, align: "center" });
    } else {
      doc.text(label, textX, textY, { align: "center" });
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    let step = t.pdfStepInit;
    const reorderCode = state.reorderCode;

    try {
      step = t.pdfStepAssets;
      await waitAssetsReady("bat-grid-container");

      const reorderTextContent = t.pdfReorderText;
      const sizeWarningContent = t.pdfSizeWarning;

      step = t.pdfStepConfig;
      const doc = new jsPDF({ orientation: "p", unit: "in", format: "letter" });
      
      const badgeW = mmToIn(state.dimensions.width);
      const badgeH = mmToIn(state.dimensions.height);
      
      // Calculate total pages
      const productionItems = [];
      for (const item of state.items) {
        const qty = item.quantity || 1;
        for (let q = 0; q < qty; q++) productionItems.push(item);
      }
      
      const badgesPerPage = 12; // Approximation for grid
      const totalPages = 1 + Math.ceil(productionItems.length / badgesPerPage);

      // --- PAGE 1: TECHNICAL PROOF ---
      step = t.pdfStepPage1;
      // Watermark removed as requested
      drawWetagPatternBar(doc, 0, 0.5); // Top bar
      await drawWetagHeader(doc, reorderCode);
      drawWetagPatternBar(doc, 10.5, 0.5); // Footer bar
      drawPageDimensions(doc);
      drawPageNumber(doc, 1, totalPages);
      
      // Large background watermark behind badge
      if (typeof doc.saveGraphicsState === "function") doc.saveGraphicsState();
      try {
        // @ts-ignore
        if (doc.GState) {
          // @ts-ignore
          doc.setGState(new doc.GState({ opacity: 0.03 }));
        }
      } catch (e) {}
      
      if (typeof doc.restoreGraphicsState === "function") doc.restoreGraphicsState();
      
      // Badge Preview
      const previewX = 1.4;
      const previewY = 2.8;
      
      const dpi = 150;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context failed");

      const pixelW = (state.dimensions.width / 25.4) * dpi;
      const pixelH = (state.dimensions.height / 25.4) * dpi;
      canvas.width = pixelW;
      canvas.height = pixelH;

      const firstItem = state.items[0] || { id: "preview", firstName: "JEAN-SÉBASTIEN", lastName: "TREMBLAY", title: "ActivityPro" };
      const svgEl = document.getElementById(`badge-svg-print-${firstItem.id}`);
      
      if (svgEl) {
        const clonedSvg = svgEl.cloneNode(true) as HTMLElement;
        clonedSvg.querySelectorAll("text").forEach(t => t.remove());
        
        const serializer = new XMLSerializer();
        let svgXml = serializer.serializeToString(clonedSvg);
        if (!svgXml.includes('xmlns="http://www.w3.org/2000/svg"')) {
          svgXml = svgXml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        const svgDataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgXml)));
        const img = new Image();
        img.src = svgDataUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pixelW, pixelH);
        ctx.drawImage(img, 0, 0, pixelW, pixelH);
        const imgData = canvas.toDataURL("image/jpeg", 0.7);
        
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(220, 50, 50); // Red border for badge preview
        doc.setLineWidth(0.005);
        doc.roundedRect(previewX - 0.05, previewY - 0.05, badgeW + 0.1, badgeH + 0.1, 0.2, 0.2, "D");
        
        doc.addImage(imgData, "JPEG", previewX, previewY, badgeW, badgeH, undefined, "SLOW");
      }

      // Dimension lines for badge
      drawDimensionLine(doc, previewX, previewY + badgeH + 0.4, previewX + badgeW, previewY + badgeH + 0.4, `3” - 76.2 mm`, false, true, 'bottom');
      drawDimensionLine(doc, previewX - 0.4, previewY, previewX - 0.4, previewY + badgeH, `1.25” - 31.7 mm`, true, true, 'left');
      
      // Thickness indicator
      doc.setDrawColor(180, 180, 180);
      doc.setLineDashPattern([0.02, 0.02], 0);
      doc.line(previewX + 0.7, previewY - 0.1, previewX + 0.7, previewY - 0.4);
      doc.setLineDashPattern([], 0);
      // Arrow head
      doc.line(previewX + 0.7, previewY - 0.1, previewX + 0.67, previewY - 0.15);
      doc.line(previewX + 0.7, previewY - 0.1, previewX + 0.73, previewY - 0.15);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text("1.0 mm / 0.04\"", previewX + 0.7, previewY - 0.5, { align: "center" });

      // Fastener Preview (Magnet)
      const fastenerX = 6.2;
      const fastenerY = 3.05;
      const fastenerW = 1.3;
      const fastenerH = 0.4;
      
      // Draw Magnet
      doc.setFillColor(30, 30, 30);
      doc.roundedRect(fastenerX, fastenerY, fastenerW, fastenerH, 0.05, 0.05, "F");
      doc.setFillColor(60, 60, 60);
      doc.roundedRect(fastenerX + 0.05, fastenerY + 0.05, fastenerW - 0.1, fastenerH - 0.1, 0.03, 0.03, "F");
      
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.setFont("Helvetica", "normal");
      doc.text(`${t.pdfFastener} : ${state.attachment === AttachmentType.MAGNET ? t.magnet : t.pin}`, fastenerX + fastenerW / 2, fastenerY + fastenerH + 0.6, { align: "center" });
      
      // Dimension lines for fastener
      drawDimensionLine(doc, fastenerX, fastenerY - 0.35, fastenerX + fastenerW, fastenerY - 0.35, "1.3” - 33 mm", false, false, 'top');
      drawDimensionLine(doc, fastenerX + fastenerW + 0.35, fastenerY, fastenerX + fastenerW + 0.35, fastenerY + fastenerH, "0.4” - 11.2 mm", true, false, 'right');

      // Technical Details
      const detailsX = 1.4;
      const detailsY = 5.5;
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.setFont("Helvetica", "normal");
      
      const matName = state.material === MaterialFamily.METAL 
        ? getFinishTranslation(state.metalFinish)
        : state.plasticColor;
      doc.text(`${t.pdfMaterial} : ${matName}`, detailsX, detailsY);
      doc.text(`${t.pdfThickness} : 1.0 mm / 0.04"`, detailsX, detailsY + 0.4);
      doc.text(`${t.pdfQuantity} : `, detailsX, detailsY + 0.8);
      
      // Quantity Box
      const totalQty = state.items.reduce((sum, item) => sum + (item.quantity || 1), 0);
      doc.setDrawColor(0, 100, 150);
      doc.setLineWidth(0.01);
      doc.rect(detailsX + 1.0, detailsY + 0.65, 0.4, 0.3);
      doc.text(totalQty.toString(), detailsX + 1.2, detailsY + 0.85, { align: "center" });

      // --- PAGE 2: PRODUCTION GRID ---
      step = t.pdfStepPage2;
      let currentPage = 2;
      doc.addPage();
      // Watermark removed for page 2+ as requested
      drawWetagPatternBar(doc, 0, 0.5);
      // Header removed for page 2+ as requested
      drawWetagPatternBar(doc, 10.5, 0.5);
      drawPageDimensions(doc);
      drawPageNumber(doc, currentPage, totalPages);
      
      const margin = 0.75;
      let xPos = margin;
      let yPos = 0.7; // Start higher since header is removed
      
      for (let i = 0; i < state.items.length; i++) {
        const item = state.items[i];
        const svgEl = document.getElementById(`badge-svg-print-${item.id}`);
        if (!svgEl) continue;

        const serializer = new XMLSerializer();
        let svgXml = serializer.serializeToString(svgEl);
        if (!svgXml.includes('xmlns="http://www.w3.org/2000/svg"')) {
          svgXml = svgXml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }
        const svgDataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgXml)));
        const img = new Image();
        img.src = svgDataUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pixelW, pixelH);
        ctx.drawImage(img, 0, 0, pixelW, pixelH);
        const imgData = canvas.toDataURL("image/jpeg", 0.7);
        
        const qty = item.quantity || 1;
        for (let q = 0; q < qty; q++) {
          doc.setDrawColor(240, 240, 240);
          doc.setLineWidth(0.005);
          doc.roundedRect(xPos - 0.05, yPos - 0.05, badgeW + 0.1, badgeH + 0.1, 0.1, 0.1, "S");
          doc.addImage(imgData, "JPEG", xPos, yPos, badgeW, badgeH, undefined, "SLOW");
          
          xPos += badgeW + 0.3;
          if (xPos + badgeW > 7.75) {
            xPos = margin;
            yPos += badgeH + 0.3;
            if (yPos + badgeH > 7.0 && (i < state.items.length - 1 || q < qty - 1)) {
              doc.addPage();
              currentPage++;
              // Watermark removed for page 2+ as requested
              drawWetagPatternBar(doc, 0, 0.5);
              // Header removed for page 2+ as requested
              drawWetagPatternBar(doc, 10.5, 0.5);
              drawPageDimensions(doc);
              drawPageNumber(doc, currentPage, totalPages);
              yPos = 0.7;
              xPos = margin;
            }
          }
        }
      }

      // Reorder info
      const bottomY = 7.2; 
      doc.setFontSize(11);
      doc.setTextColor(0, 100, 150);
      doc.setFont("Helvetica", "bold");
      doc.text(t.pdfReorderCodeLabel, margin, bottomY);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont("Helvetica", "italic");
      doc.text(doc.splitTextToSize(reorderTextContent, 7), margin, bottomY + 0.25);
      
      doc.setTextColor(220, 50, 50);
      doc.setFontSize(10);
      doc.setFont("Helvetica", "italic");
      doc.text(doc.splitTextToSize(sizeWarningContent, 7), margin, bottomY + 0.9);

      const pdfBase64 = doc.output('datauristring');
      doc.save(`PRODUCTION_WETAG_${Date.now()}.pdf`);

    } catch (err: any) {
      alert(t.pdfExportError.replace("{step}", step).replace("{message}", err.message));
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  // -------------------- SVG Export (Unified with PDF) --------------------
  const handleExportSVG = async () => {
    setIsExporting(true);
    try {
      await waitAssetsReady("svg-export-container");

      const dpi = 100;
      const bW = mmToIn(state.dimensions.width) * dpi;
      const bH = mmToIn(state.dimensions.height) * dpi;
      const margin = 0.5 * dpi;
      const columns = 2;
      const totalCols = Math.min(columns, state.items.length || 1);
      const totalRows = Math.ceil((state.items.length || 1) / totalCols);
      const sheetW = totalCols * bW + (totalCols + 1) * margin;
      const sheetH = totalRows * bH + (totalRows + 1) * margin;

      const rx = state.roundedCorners ? mmToIn(state.cornerRadius) * dpi : 0;

      let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
      svg += `<svg version="1.1" baseProfile="full" width="${sheetW}" height="${sheetH}" viewBox="0 0 ${sheetW} ${sheetH}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve">\n`;
      svg += `<defs>\n`;
      svg += `  <clipPath id="tagClip"><rect width="${bW}" height="${bH}" rx="${rx}" ry="${rx}" /></clipPath>\n`;
      
      // Collect all defs from individual tags to place them at the top level
      // Illustrator prefers defs to be at the root of the SVG.
      const addedDefsIds = new Set<string>();
      for (let i = 0; i < state.items.length; i++) {
        const item = state.items[i];
        const el = document.getElementById(`badge-svg-export-${item.id}`);
        if (!el) continue;
        const tagDefsList = el.querySelectorAll("defs");
        tagDefsList.forEach(tagDefs => {
          const serializer = new XMLSerializer();
          Array.from(tagDefs.childNodes).forEach(child => {
            if (child instanceof Element) {
              const id = child.getAttribute("id");
              if (id) {
                if (addedDefsIds.has(id)) return;
                addedDefsIds.add(id);
              }
            }
            svg += "  " + serializer.serializeToString(child) + "\n";
          });
        });
      }
      svg += `</defs>\n`;

      for (let i = 0; i < state.items.length; i++) {
        const item = state.items[i];
        const el = document.getElementById(`badge-svg-export-${item.id}`);
        if (!el) continue;

        const col = i % totalCols;
        const row = Math.floor(i / totalCols);
        const x = margin + col * (bW + margin);
        const y = margin + row * (bH + margin);

        // Extract only the main group (the content) to avoid nested defs and svg tags
        const mainGroup = el.querySelector("g");
        if (!mainGroup) continue;

        const serializer = new XMLSerializer();
        
        // Illustrator compatibility fixes:
        // 1. Ensure both href and xlink:href are present for images
        // We use a clone to avoid modifying the live DOM and ensure proper SVG serialization
        const clonedGroup = mainGroup.cloneNode(true) as SVGGElement;
        clonedGroup.querySelectorAll('image').forEach(img => {
          const href = img.getAttribute('href') || img.getAttribute('xlink:href');
          if (href) {
            // Ensure both are present for maximum compatibility
            img.setAttribute('href', href);
            img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href);
          }
        });
        
        let groupContent = serializer.serializeToString(clonedGroup);
        
        svg += `<g id="tag-${escapeXml(item.id)}" transform="translate(${x}, ${y})">\n`;
        svg += groupContent;
        svg += `</g>\n`;
      }

      svg += `</svg>`;

      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `PRODUCTION_WETAG_${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(t.svgExportError.replace("{message}", err.message));
    } finally {
      setIsExporting(false);
    }
  };

  const handleFinalExport = () => {
    if (exportFormat === "pdf") handleExportPDF();
    else handleExportSVG();
  };

  const isCurrentInvalid = invalidIds.has(currentItem.id) && !acceptedIds.has(currentItem.id);
  const activeStyle = getActiveStyle(currentItem);

  // -------------------- Typo Hint UI --------------------
  const TypoHint: React.FC<{ field: "firstName" | "lastName" | "title"; item: NametagItem }> = ({ field, item }) => {
    const suggestion = (item as any).typoSuggestions?.[field];
    if (!suggestion || suggestion.dismissed) return null;
    return (
      <div className="flex flex-col gap-2 mt-2 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl animate-in shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-indigo-500 fill-indigo-200" />
          <span className="text-[10px] font-bold text-indigo-900 heartbeat leading-tight">
            {t.suggestion} : {suggestion.suggestion} ?
          </span>
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={() => ignoreTypoSuggestion(field)}
            className="px-3 py-1 bg-white border border-slate-200 text-slate-500 rounded-lg text-[9px] font-black uppercase hover:bg-slate-50 transition-all"
          >
            {t.ignore}
          </button>
          <button
            onClick={() => applyTypoSuggestion(field, suggestion.suggestion)}
            className="px-4 py-1 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all"
          >
            {t.apply}
          </button>
        </div>
      </div>
    );
  };

  // -------------------- Preview Component --------------------
  const NametagPreview: React.FC<{
    item: NametagItem;
    scale?: number;
    isPrint?: boolean;
    onQCChange?: (id: string, isValid: boolean) => void;
    isValidator?: boolean;
  }> = ({ item, scale = 1, isPrint = false, onQCChange, isValidator = false }) => {
    const isCustom = state.shape === ShapeType.CUSTOM && !!state.customShape;
    const clipId = `clip-shape-${(item as any).id}-${isPrint ? "p" : "v"}`;
    const finish = METAL_FINISHES.find((f) => f.name === state.metalFinish) || METAL_FINISHES[0];
    const plastic = PLASTIC_COLORS.find((c) => c.name === state.plasticColor) || PLASTIC_COLORS[0];
    const style = getActiveStyle(item);
    const bgColor = state.material === MaterialFamily.METAL ? finish.bgColor : plastic.bgColor;
    const bgStyle = state.material === MaterialFamily.METAL ? finish.gradient : "none";
    const finalNameColor = state.material === MaterialFamily.PLASTIC ? plastic.textColor : style.nameColor;
    const finalTitleColor = state.material === MaterialFamily.PLASTIC ? plastic.textColor : style.titleColor;

    const containerRef = useRef<HTMLDivElement>(null);
    const nameRef = useRef<HTMLHeadingElement>(null);
    const titleRef = useRef<HTMLParagraphElement>(null);
    const logoRef = useRef<HTMLDivElement>(null);

    const [isInternalValid, setIsInternalValid] = useState(true);
    const [collisionDetails, setCollisionDetails] = useState({
      nameOverflow: false,
      titleOverflow: false,
      textOverlap: false,
      logoCollision: false,
    });

    const validateProduction = () => {
      if (!containerRef.current || !nameRef.current || !titleRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const nameRect = nameRef.current.getBoundingClientRect();
      const titleRect = titleRef.current.getBoundingClientRect();

      const nameOverflow =
        nameRect.left < containerRect.left + 1 ||
        nameRect.right > containerRect.right - 1 ||
        nameRect.top < containerRect.top + 1 ||
        nameRect.bottom > containerRect.bottom - 1;

      const titleOverflow =
        titleRect.left < containerRect.left + 1 ||
        titleRect.right > containerRect.right - 1 ||
        titleRect.top < containerRect.top + 1 ||
        titleRect.bottom > containerRect.bottom - 1;

      const textOverlap = nameRect.bottom > titleRect.top + 1;

      let logoCollision = false;
      if (logoRef.current) {
        const logoRect = logoRef.current.getBoundingClientRect();
        const intersect = (r1: DOMRect, r2: DOMRect) =>
          !(r2.left >= r1.right || r2.right <= r1.left || r2.top >= r1.bottom || r2.bottom <= r1.top);
        logoCollision = intersect(logoRect, nameRect) || intersect(logoRect, titleRect);
      }

      const isCurrentlyValid = !nameOverflow && !titleOverflow && !textOverlap && !logoCollision;

      setIsInternalValid(isCurrentlyValid);
      setCollisionDetails({ nameOverflow, titleOverflow, textOverlap, logoCollision });

      if (onQCChange) onQCChange((item as any).id, isCurrentlyValid);

      if (containerRef.current && !isValidator) {
        containerRef.current.style.outline = isCurrentlyValid || acceptedIds.has((item as any).id ? (item as any).id : "") ? "none" : "4px solid #ef4444";
        containerRef.current.style.outlineOffset = "2px";
      }
    };

    useLayoutEffect(() => {
      const checkReady = async () => {
        if (state.logo) {
          const img = new Image();
          img.src = state.logo;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyImg: any = img;
            if (typeof anyImg.decode === "function") await anyImg.decode();
          } catch {
            // ignore
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyDoc: any = document;
        if (anyDoc.fonts?.ready) await anyDoc.fonts.ready;
        validateProduction();
      };

      const timer = setTimeout(checkReady, 150);
      return () => clearTimeout(timer);
      // include exportLogoPng to re-validate when export raster updates
    }, [
      item,
      state.globalStyle,
      state.logo,
      state.logoScale,
      state.logoGap,
      state.logoMargin,
      state.logoOffsetX,
      state.logoOffsetY,
      state.logoPos,
      state.dimensions,
      state.background,
      scale,
      acceptedIds,
      exportLogoPng,
    ]);

const getLayoutClasses = () => {
  const p = state.logoPos as any;

  switch (p) {
    case "top-left":
      return "flex-col items-start justify-start";
    case "top":
      return "flex-col items-center justify-start";
    case "top-right":
      return "flex-col items-end justify-start";

    case "left":
      return "flex-row items-center justify-start";
    case "center":
      return "flex-col items-center justify-center";
    case "right":
      return "flex-row-reverse items-center justify-start";

    case "bottom-left":
      return "flex-col-reverse items-start justify-start";
    case "bottom":
      return "flex-col-reverse items-center justify-start";
    case "bottom-right":
      return "flex-col-reverse items-end justify-start";

    default:
      return "flex-col items-center justify-start";
  }
};

    const dimW_in = mmToIn(state.dimensions.width);
    const dimH_in = mmToIn(state.dimensions.height);
    const radius_in = mmToIn(state.cornerRadius);
    const margin_in = mmToIn(state.logoMargin);
    const offX_in = mmToIn(state.logoOffsetX);
    const offY_in = mmToIn(state.logoOffsetY);

    const badgeWidth = isPrint ? `${dimW_in}in` : `${dimW_in * 100 * scale}px`;
    const badgeHeight = isPrint ? `${dimH_in}in` : `${dimH_in * 100 * scale}px`;
    const radiusValue = state.roundedCorners ? (isPrint ? `${radius_in}in` : `${radius_in * 100 * scale}px`) : "0px";

    const isAccepted = acceptedIds.has((item as any).id);
    const isBrushed = (state.material === MaterialFamily.METAL && state.metalFinish.toLowerCase().includes("brossé")) ||
                      (state.material === MaterialFamily.PLASTIC && state.plasticColor.toLowerCase().includes("brossé"));

    const getDebugStyle = (ref: React.RefObject<HTMLElement>) => {
      if (!ref.current || !containerRef.current) return {};
      const c = containerRef.current.getBoundingClientRect();
      const r = ref.current.getBoundingClientRect();
      return { top: `${r.top - c.top}px`, left: `${r.left - c.left}px`, width: `${r.width}px`, height: `${r.height}px` };
    };

    const activeVectorXml = (item as any).vectorLogoXml || ((item as any).logoVersion === "vector" ? state.vectorLogoXml : null);
    const activeVectorDataUrl = useMemo(() => {
      if (!activeVectorXml) return null;
      try {
        const normalizedSvg = normalizeSvgForInline(activeVectorXml);
        return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(normalizedSvg)));
      } catch {
        return null;
      }
    }, [activeVectorXml]);

    // CRITICAL FIX: for print/export we force a PNG-painted image
    const logoSrcForRender = isPrint
      ? exportLogoPng || state.logo
      : coloredLogoUrl || state.logo;

    return (
      <div
        ref={containerRef}
        id={isValidator ? `val-unit-${(item as any).id}` : isPrint ? `badge-print-${(item as any).id}` : "nametag-preview"}
        className={`relative overflow-hidden flex transition-all duration-300 badge-render ${!isPrint && !isValidator ? "shadow-2xl" : ""}`}
        style={{
          width: badgeWidth,
          height: badgeHeight,
          background: bgStyle !== "none" ? bgStyle : bgColor,
          backgroundColor: bgColor,
          borderRadius: !isCustom ? radiusValue : "0px",
          clipPath: isCustom ? `url(#${clipId})` : "none",
          border: "none",
          padding: isPrint ? `${margin_in}in` : `${margin_in * 100 * scale}px`,
          fontFamily: style.fontFamily,
        }}
      >
        {isCustom && (
          <svg width="0" height="0" className="absolute">
            <defs>
              <clipPath id={clipId} clipPathUnits="objectBoundingBox">
                <path d={state.customShape?.normalizedPathD} />
              </clipPath>
            </defs>
          </svg>
        )}
        {state.background && (
          <div className="absolute inset-0 z-0 pointer-events-none" style={{ opacity: state.backgroundOpacity }}>
            <img src={state.background} className="w-full h-full object-cover" alt="background" />
          </div>
        )}
        {isBrushed && (
          <div 
            className="absolute inset-0 pointer-events-none z-[2] opacity-[0.6] mix-blend-overlay" 
            style={{ 
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.001 0.95' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }} 
          />
        )}
        {isBrushed && (
          <div 
            className="absolute inset-0 pointer-events-none z-[3] opacity-[0.15] mix-blend-multiply" 
            style={{ 
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Cfilter id='noiseFilter2'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.002 0.8' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter2)'/%3E%3C/svg%3E")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }} 
          />
        )}

        <div className={`w-full h-full flex z-10 ${getLayoutClasses()}`} style={{ gap: isPrint ? `${state.logoGap / 100}in` : `${state.logoGap * scale}px` }}>
          {state.logo && (
            <div
              ref={logoRef}
              id="logo-container"
              className="shrink-0 flex items-center justify-center overflow-hidden transition-transform duration-200"
              style={{
                width: isPrint ? `${(state.logoScale * 0.7) / 100}in` : `${state.logoScale * scale * 0.7}px`,
                height: isPrint
                  ? `${((state.logoScale * 0.7) / 100) / (logoRatio || 1)}in`
                  : `${(state.logoScale * scale * 0.7) / (logoRatio || 1)}px`,
                maxWidth: "45%",
                maxHeight: "85%",
                transform: isPrint
  ? `translate(${offX_in}in, ${offY_in}in)`
  : `translate(${state.logoOffsetX * scale}px, ${state.logoOffsetY * scale}px)`,
              }}
            >
              <img src={logoSrcForRender || ""} className="max-w-full max-h-full object-contain block" alt="logo" />
            </div>
          )}

          <div
            className={`${state.logoPos === "center" ? "" : "flex-1"} flex flex-col justify-center min-w-0 ${
              style.alignment === "center" ? "text-center items-center" : style.alignment === "right" ? "text-right items-end" : "text-left items-start"
            }`}
          >
            <h2
              id="display-name"
              ref={nameRef}
              className={`w-full leading-tight uppercase overflow-hidden ${style.isMultiline ? "break-words whitespace-normal" : "truncate whitespace-nowrap"}`}
              style={{
                fontFamily: style.fontFamily,
                fontSize: isPrint ? `${style.nameSize / 100}in` : `${style.nameSize * scale}px`,
                fontWeight: style.bold ? 900 : 700,
                color: finalNameColor,
                textAlign: style.alignment,
              }}
            >
              {(item as any).firstName} {(item as any).lastName}
            </h2>
            <p
              id="display-title"
              ref={titleRef}
              className={`w-full mt-1 leading-tight font-medium overflow-hidden ${style.isMultiline ? "break-words whitespace-normal" : "truncate whitespace-nowrap"}`}
              style={{
                fontFamily: style.fontFamily,
                fontSize: isPrint ? `${style.titleSize / 100}in` : `${style.titleSize * scale}px`,
                color: finalTitleColor,
                textAlign: style.alignment,
              }}
            >
              {(item as any).title}
            </p>
          </div>
        </div>

        {!isInternalValid && !isValidator && !isPrint && (
          <div className="absolute inset-0 pointer-events-none z-50">
            {collisionDetails.nameOverflow && <div className="absolute border border-red-500 bg-red-500/10" style={getDebugStyle(nameRef)} />}
            {collisionDetails.titleOverflow && <div className="absolute border border-red-500 bg-red-500/10" style={getDebugStyle(titleRef)} />}
            {collisionDetails.logoCollision && logoRef.current && <div className="absolute border border-red-500 bg-red-500/10" style={getDebugStyle(logoRef as any)} />}
          </div>
        )}

        {!isInternalValid && !isAccepted && !isPrint && !isValidator && (
          <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xl z-[60] animate-pulse border border-white/20 scale-[0.7] origin-top-right">
            <AlertTriangle size={10} strokeWidth={3} />
            <span className="text-[8px] font-black uppercase tracking-widest">{t.geometricError}</span>
          </div>
        )}
      </div>
    );
  };

  // -------------------- UI --------------------
  const isLogoVectorized = state.isLogoVectorized;
  const handleFinalExportDisabled = isExporting;

  return (
    <div className="h-screen flex flex-col bg-[#f8fafc] overflow-hidden text-[#0f172a] font-medium">
      {/* Validator grid (offscreen but still renderable) */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none w-0 h-0 overflow-hidden" aria-hidden="true">
        {state.items.map((item) => (
          <NametagPreview key={`v-${(item as any).id}`} item={item} isValidator={true} onQCChange={handleQCChange} />
        ))}
      </div>

      {/* Print grid: IMPORTANT: DO NOT set opacity-0 (it makes html2canvas capture transparent) */}
      <div id="bat-grid-container" className="fixed -left-[9999px] top-0 pointer-events-none" aria-hidden="true">
        {state.items.map((item) => (
          <NametagSvg key={`p-${item.id}`} item={item} state={state} logoRatio={logoRatio} id={`badge-svg-print-${item.id}`} titleWeight="500" coloredLogoUrl={coloredLogoUrl} />
        ))}
      </div>

      {/* SVG Export grid (no gradients, bolder title as requested) */}
      <div id="svg-export-container" className="fixed -left-[9999px] top-0 pointer-events-none" aria-hidden="true">
        {state.items.map((item) => (
          <NametagSvg key={`s-${item.id}`} item={item} state={state} logoRatio={logoRatio} id={`badge-svg-export-${item.id}`} noGradient={true} titleWeight="600" coloredLogoUrl={coloredLogoUrl} />
        ))}
      </div>

      <nav className="h-16 bg-white border-b px-6 flex justify-between items-center z-50 shrink-0 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg">W</div>
            <h1 className="text-lg font-black uppercase tracking-tighter">
              Wetag <span className="text-indigo-600">Studio</span>
            </h1>
          </div>

          {activeErrorsCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-full border border-red-200 animate-pulse">
              <AlertTriangle size={14} />
              <span className="text-[10px] font-black uppercase">{activeErrorsCount} {t.errorsDetected}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
            <button
              onClick={() => setLanguage('fr')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                language === 'fr' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              FR
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                language === 'en' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              EN
            </button>
          </div>

          <div className={`flex items-center px-5 py-2.5 rounded-xl border-2 transition-all shadow-md ${!state.reorderCode || state.reorderCode.length < 6 ? 'bg-amber-50 border-amber-400 ring-4 ring-amber-500/10' : 'bg-white border-slate-200'}`}>
            <div className="flex flex-col mr-4">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                {t.reorderCode} <span className="text-red-500 text-xs">*</span>
              </span>
              {!state.reorderCode || state.reorderCode.length < 6 ? (
                <span className="text-[8px] font-bold text-amber-600 uppercase animate-pulse">{t.required}</span>
              ) : (
                <span className="text-[8px] font-bold text-emerald-600 uppercase">{t.validated}</span>
              )}
            </div>
            <input
              type="text"
              maxLength={6}
              value={state.reorderCode}
              onChange={(e) => updateState({ reorderCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              className="w-32 bg-transparent text-2xl font-black text-indigo-600 outline-none placeholder:text-amber-200 tracking-widest"
              placeholder="000000"
            />
          </div>

          <div className="flex items-center px-5 py-2.5 bg-white rounded-xl border-2 border-slate-100 shadow-md">
            <div className="flex flex-col mr-4">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.total}</span>
              <span className="text-[8px] font-bold text-slate-400 uppercase">{t.taxIncluded}</span>
            </div>
            <span className="text-2xl font-black text-indigo-600">{calculateTotalPrice().toFixed(2)}€</span>
          </div>

          <button
            onClick={handleAddToCart}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase shadow-xl hover:bg-emerald-700 active:scale-95 transition-all"
          >
            <ShoppingCart size={18} />
            {t.addToCart}
          </button>

          <div className="w-px h-8 bg-slate-200 mx-2" />

          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setExportFormat("pdf")}
              className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${exportFormat === "pdf" ? "bg-white shadow-sm text-indigo-600" : "text-slate-400"}`}
            >
              {t.pdfVector}
            </button>
            <button
              onClick={() => setExportFormat("svg")}
              className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${exportFormat === "svg" ? "bg-white shadow-sm text-indigo-600" : "text-slate-400"}`}
            >
              {t.svgIllustrator}
            </button>
          </div>

          <button
            onClick={handleFinalExport}
            disabled={handleFinalExportDisabled}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase shadow-xl hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-60"
          >
            <Download size={18} />
            {isExporting ? t.exporting : t.exportProduction}
          </button>
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        {/* LEFT */}
        <aside className="w-[380px] bg-white border-r flex flex-col shrink-0 shadow-sm z-10">
          <div className="p-6 border-b space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t.items}</h3>
              <div className="flex gap-2">
                <button onClick={() => setIsImportModalOpen(true)} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all border shadow-sm">
                  <FileSpreadsheet size={16} />
                </button>
                <button onClick={addItem} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-md transition-all">
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border shadow-inner">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col">
                  <input
                    type="text"
                    placeholder={t.nameLabel}
                    value={(currentItem as any).firstName}
                    onChange={(e) => updateCurrentItem({ firstName: e.target.value.toUpperCase() } as any)}
                    className="p-3 bg-white border rounded-xl text-xs font-bold outline-none focus:ring-2 ring-indigo-500/20 shadow-sm"
                  />
                  <TypoHint field="firstName" item={currentItem} />
                </div>
                <div className="flex flex-col">
                  <input
                    type="text"
                    placeholder={t.nameLabel}
                    value={(currentItem as any).lastName}
                    onChange={(e) => updateCurrentItem({ lastName: e.target.value.toUpperCase() } as any)}
                    className="p-3 bg-white border rounded-xl text-xs font-bold outline-none focus:ring-2 ring-indigo-500/20 shadow-sm"
                  />
                  <TypoHint field="lastName" item={currentItem} />
                </div>
              </div>

              <div className="flex flex-col">
                <input
                  type="text"
                  placeholder={t.titleLabel}
                  value={(currentItem as any).title}
                  onChange={(e) => updateCurrentItem({ title: e.target.value } as any)}
                  className="w-full p-3 bg-white border rounded-xl text-xs font-bold outline-none focus:ring-2 ring-indigo-500/20 shadow-sm"
                />
                <TypoHint field="title" item={currentItem} />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {state.items.map((item: any, idx) => {
              const hasError = invalidIds.has(item.id) && !acceptedIds.has(item.id);
              const hasIndividualStyle = !!item.overrides;
              const hasTypo = item.typoSuggestions && Object.values(item.typoSuggestions).some((s: any) => !s.dismissed);

              return (
                <div
                  key={item.id}
                  onClick={() => updateState({ selectedIndex: idx })}
                  className={`p-4 rounded-2xl cursor-pointer border-2 transition-all flex items-center gap-4 ${
                    state.selectedIndex === idx
                      ? hasError
                        ? "bg-red-50 border-red-500 shadow-md"
                        : "bg-indigo-50 border-indigo-600 shadow-md"
                      : hasError
                      ? "bg-white border-red-400 hover:border-red-500"
                      : "bg-white border-slate-100 hover:border-slate-300"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${
                      state.selectedIndex === idx ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {idx + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-black uppercase truncate leading-none flex items-center gap-2">
                      {item.firstName} {item.lastName}
                      {hasIndividualStyle && <SlidersHorizontal size={10} className="text-indigo-400" />}
                      {hasTypo && <Sparkles size={10} className="text-amber-500" />}
                    </p>
                    <p className="text-[9px] text-slate-500 uppercase truncate mt-1">{item.title || "Sans titre"}</p>
                  </div>

                  {hasError && <AlertTriangle size={14} className="text-red-500 shrink-0 mr-2" />}
                </div>
              );
            })}
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 flex flex-col items-center justify-center relative p-12 bg-[#f4f7f9] shadow-inner overflow-hidden">
          <div className="scale-[1.8] transition-all duration-500">
            <NametagPreview item={currentItem} scale={1.8} onQCChange={handleQCChange} />
          </div>

          {isCurrentInvalid && (
            <div className="absolute right-12 top-1/2 -translate-y-1/2 w-[340px] bg-white rounded-[2.5rem] border-2 border-red-500 shadow-[0_20px_50px_rgba(239,68,68,0.2)] p-10 flex flex-col items-center text-center animate-in z-50">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle size={40} className="text-red-500" />
              </div>
              <h2 className="text-red-600 font-black text-xl uppercase tracking-tighter leading-tight mb-4">{t.securityZoneBreached}</h2>
              <p className="text-[11px] text-slate-400 font-bold leading-relaxed uppercase tracking-widest mb-10">
                {t.securityZoneWarning}
              </p>
              <button
                onClick={() => setAcceptedIds((p) => new Set(p).add((currentItem as any).id))}
                className="w-full py-5 bg-emerald-500 text-white rounded-2xl font-black text-[12px] uppercase shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-all active:scale-95 tracking-[0.1em]"
              >
                {t.ignoreAndValidate}
              </button>
            </div>
          )}

          <div className="absolute bottom-12 flex items-center gap-8 bg-white px-8 py-4 rounded-3xl shadow-2xl border">
            <button
              onClick={() => updateState({ selectedIndex: Math.max(0, state.selectedIndex - 1) })}
              disabled={state.selectedIndex === 0}
              className={`p-2 rounded-full transition-all ${state.selectedIndex === 0 ? "text-slate-200" : "hover:bg-slate-100 active:scale-90 shadow-sm"}`}
            >
              <ChevronLeft size={28} />
            </button>
            <span className="text-xl font-black text-slate-900 tracking-tighter">
              {state.selectedIndex + 1} <span className="text-slate-300 mx-1">/</span> {state.items.length}
            </span>
            <button
              onClick={() => updateState({ selectedIndex: Math.min(state.items.length - 1, state.selectedIndex + 1) })}
              disabled={state.selectedIndex === state.items.length - 1}
              className={`p-2 rounded-full transition-all ${
                state.selectedIndex === state.items.length - 1 ? "text-slate-200" : "hover:bg-slate-100 active:scale-90 shadow-sm"
              }`}
            >
              <ChevronRight size={28} />
            </button>
          </div>
        </main>

        {/* RIGHT */}
        <aside className="w-[420px] bg-white border-l overflow-y-auto shrink-0 shadow-lg">
          <div className="flex border-b sticky top-0 bg-white z-20">
            <button
              onClick={() => setActiveTab("product")}
              className={`flex-1 flex flex-col items-center py-4 gap-1 transition-all ${
                activeTab === "product" ? "border-b-4 border-indigo-600 text-indigo-600 bg-indigo-50/30" : "text-slate-400 hover:bg-slate-50"
              }`}
            >
              <Box size={20} />
              <span className="text-[9px] font-black uppercase tracking-widest">{t.productTab}</span>
            </button>
            <button
              onClick={() => setActiveTab("logo")}
              className={`flex-1 flex flex-col items-center py-4 gap-1 transition-all ${
                activeTab === "logo" ? "border-b-4 border-indigo-600 text-indigo-600 bg-indigo-50/30" : "text-slate-400 hover:bg-slate-50"
              }`}
            >
              <ImageIcon size={20} />
              <span className="text-[9px] font-black uppercase tracking-widest">{t.designTab}</span>
            </button>
            <button
              onClick={() => setActiveTab("style")}
              className={`flex-1 flex flex-col items-center py-4 gap-1 transition-all ${
                activeTab === "style" ? "border-b-4 border-indigo-600 text-indigo-600 bg-indigo-50/30" : "text-slate-400 hover:bg-slate-50"
              }`}
            >
              <Type size={20} />
              <span className="text-[9px] font-black uppercase tracking-widest">{t.styleTab}</span>
            </button>
          </div>

          <div className="p-6 space-y-10 animate-in pb-20">
            {/* PRODUCT TAB */}
            {activeTab === "product" && (
              <div className="space-y-10">
                <section>
                  <label className="text-[11px] font-black uppercase block mb-6 tracking-[0.2em] text-slate-900">{t.familyAndMaterial}</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => updateState({ material: MaterialFamily.METAL })}
                      className={`relative p-8 rounded-[2rem] border-2 flex flex-col items-center gap-4 transition-all duration-300 ${
                        state.material === MaterialFamily.METAL ? "border-indigo-600 bg-[#f5f7ff] shadow-xl" : "border-slate-100 bg-white hover:border-slate-300"
                      }`}
                    >
                      {state.material === MaterialFamily.METAL && (
                        <div className="absolute top-4 right-4 text-indigo-600">
                          <CheckCircle size={20} fill="currentColor" className="text-white" />
                        </div>
                      )}
                      <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all ${state.material === MaterialFamily.METAL ? "bg-indigo-600 text-white" : "bg-[#e2e8f0] text-slate-400"}`}>
                        <Zap size={32} fill={state.material === MaterialFamily.METAL ? "currentColor" : "none"} />
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${state.material === MaterialFamily.METAL ? "text-indigo-600" : "text-slate-400"}`}>{t.metal}</span>
                    </button>

                    <button
                      onClick={() => updateState({ material: MaterialFamily.PLASTIC })}
                      className={`relative p-8 rounded-[2rem] border-2 flex flex-col items-center gap-4 transition-all duration-300 ${
                        state.material === MaterialFamily.PLASTIC ? "border-indigo-600 bg-[#f5f7ff] shadow-xl" : "border-slate-100 bg-white hover:border-slate-300"
                      }`}
                    >
                      {state.material === MaterialFamily.PLASTIC && (
                        <div className="absolute top-4 right-4 text-indigo-600">
                          <CheckCircle size={20} fill="currentColor" className="text-white" />
                        </div>
                      )}
                      <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center transition-all ${state.material === MaterialFamily.PLASTIC ? "bg-indigo-600 text-white" : "bg-[#e2e8f0] text-slate-400"}`}>
                        <Palette size={32} />
                      </div>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${state.material === MaterialFamily.PLASTIC ? "text-indigo-600" : "text-slate-400"}`}>{t.plastic}</span>
                    </button>
                  </div>
                </section>

                <section>
                  <label className="text-[11px] font-black uppercase block mb-6 tracking-[0.2em] text-slate-900">{t.shape}</label>
                  <div className="flex gap-2 p-2 bg-[#f1f5f9] rounded-[2.5rem] border-2 border-slate-100">
                    <button
                      onClick={() => updateState({ shape: ShapeType.STANDARD })}
                      className={`flex-1 py-4 rounded-[2rem] font-black text-[10px] uppercase transition-all ${
                        state.shape === ShapeType.STANDARD ? "bg-white shadow-lg text-indigo-600" : "text-slate-400"
                      }`}
                    >
                      {t.standard}
                    </button>
                    <button
                      onClick={() => updateState({ shape: ShapeType.CUSTOM })}
                      className={`flex-1 py-4 rounded-[2rem] font-black text-[10px] uppercase transition-all ${
                        state.shape === ShapeType.CUSTOM ? "bg-white shadow-lg text-indigo-600" : "text-slate-400"
                      }`}
                    >
                      {t.custom}
                    </button>
                  </div>
                  {state.shape === ShapeType.CUSTOM && (
                    <div className="mt-4 space-y-4 animate-in">
                      <button
                        onClick={() => shapeInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-3 py-5 bg-indigo-50 text-indigo-600 rounded-[1.5rem] font-black text-[10px] uppercase border-2 border-dashed border-indigo-200"
                      >
                        <Scissors size={20} />
                        {state.customShape ? t.modifyShape : t.importShape}
                      </button>
                      <input type="file" ref={shapeInputRef} onChange={handleCustomShapeUpload} className="hidden" accept=".svg,.pdf,image/*" />
                    </div>
                  )}
                </section>

                <section>
                  <div className="flex justify-between items-center mb-6">
                    <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900 flex items-center gap-2">
                      <Ruler size={14} className="text-slate-400" />
                      {t.badgeFormat}
                    </label>
                    <div className="flex p-1 bg-[#e2e8f0] rounded-xl border">
                      <button
                        onClick={() => updateState({ dimensions: { ...state.dimensions, unit: "in" } })}
                        className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all ${
                          state.dimensions.unit === "in" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"
                        }`}
                      >
                        IN
                      </button>
                      <button
                        onClick={() => updateState({ dimensions: { ...state.dimensions, unit: "mm" } })}
                        className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all ${
                          state.dimensions.unit === "mm" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"
                        }`}
                      >
                        MM
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-[#f1f5f9] p-6 rounded-[2rem] border-2 border-slate-100">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase text-slate-400 px-2">{t.width} ({state.dimensions.unit})</label>
                      <input
                        type="text"
                        value={widthInput}
                        onChange={(e) => handleDimensionChange("width", e.target.value)}
                        onBlur={() => setWidthInput(formatDimension(state.dimensions.width, state.dimensions.unit))}
                        className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-sm outline-none shadow-sm focus:border-indigo-600 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase text-slate-400 px-2">{t.height} ({state.dimensions.unit})</label>
                      <input
                        type="text"
                        value={heightInput}
                        onChange={(e) => handleDimensionChange("height", e.target.value)}
                        onBlur={() => setHeightInput(formatDimension(state.dimensions.height, state.dimensions.unit))}
                        className="w-full p-4 bg-white border-2 border-slate-100 rounded-2xl font-black text-sm outline-none shadow-sm focus:border-indigo-600 transition-all"
                      />
                    </div>
                  </div>
                </section>

                <section>
                  <label className="text-[11px] font-black uppercase block mb-6 tracking-[0.2em] text-slate-900">{t.badgeCorners}</label>
                  <div className="flex gap-2 p-2 bg-[#f1f5f9] rounded-[2.5rem] border-2 border-slate-100">
                    <button
                      onClick={() => updateState({ roundedCorners: true })}
                      className={`flex-1 py-4 rounded-[2rem] font-black text-[10px] uppercase transition-all ${
                        state.roundedCorners ? "bg-white shadow-lg text-indigo-600" : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      {t.rounded} (0.25")
                    </button>
                    <button
                      onClick={() => updateState({ roundedCorners: false })}
                      className={`flex-1 py-4 rounded-[2rem] font-black text-[10px] uppercase transition-all ${
                        !state.roundedCorners ? "bg-white shadow-lg text-indigo-600" : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      {t.square}
                    </button>
                  </div>
                </section>

                <section>
                  <label className="text-[11px] font-black uppercase block mb-6 tracking-[0.2em] text-slate-900">
                    {state.material === MaterialFamily.METAL ? t.finishAndRendering : t.plasticColor}
                  </label>
                  {state.material === MaterialFamily.METAL ? (
                    <div className="grid grid-cols-2 gap-4">
                      {METAL_FINISHES.map((f) => (
                        <button
                          key={f.name}
                          onClick={() => updateState({ metalFinish: f.name })}
                          className={`group relative h-24 rounded-[1.5rem] border-2 transition-all duration-300 overflow-hidden flex items-center justify-center ${
                            state.metalFinish === f.name ? "border-indigo-600 shadow-xl" : "border-slate-100 hover:border-slate-300"
                          }`}
                        >
                          <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-110" style={{ background: f.gradient !== "none" ? f.gradient : f.bgColor }} />
                          {state.metalFinish === f.name && (
                            <div className="absolute top-3 right-3 text-indigo-600 z-10">
                              <CheckCircle size={16} fill="currentColor" className="text-white" />
                            </div>
                          )}
                          <span className="relative bg-white/90 backdrop-blur-sm px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-900 shadow-sm border border-white/50">
                            {getFinishTranslation(f.name)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 pb-2">
                      {PLASTIC_COLORS.map((c) => (
                        <button
                          key={c.name}
                          onClick={() => updateState({ plasticColor: c.name })}
                          className={`group relative h-24 rounded-[1.5rem] border-2 transition-all duration-300 overflow-hidden flex flex-col items-center justify-center ${
                            state.plasticColor === c.name ? "border-indigo-600 shadow-xl" : "border-slate-100 hover:border-slate-300"
                          }`}
                        >
                          <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-110" style={{ backgroundColor: c.bgColor }} />
                          {state.plasticColor === c.name && (
                            <div className="absolute top-3 right-3 text-indigo-600 z-10">
                              <CheckCircle size={16} fill="currentColor" className="text-white" />
                            </div>
                          )}
                          <span className="relative bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-900 shadow-sm border border-white/50 mb-1">
                            {c.name}
                          </span>
                          <span className="relative bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-[8px] font-bold uppercase text-slate-500">
                            {c.code}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <label className="text-[11px] font-black uppercase block mb-6 tracking-[0.2em] text-slate-900">{t.attachmentType}</label>
                  <div className="flex gap-2 p-2 bg-[#f1f5f9] rounded-[2.5rem] border-2 border-slate-100">
                    <button
                      onClick={() => updateState({ attachment: AttachmentType.MAGNET })}
                      className={`flex-1 py-4 rounded-[2rem] font-black text-[10px] uppercase transition-all ${
                        state.attachment === AttachmentType.MAGNET ? "bg-white shadow-lg text-indigo-600" : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      {t.magnetic}
                    </button>
                    <button
                      onClick={() => updateState({ attachment: AttachmentType.PIN })}
                      className={`flex-1 py-4 rounded-[2rem] font-black text-[10px] uppercase transition-all ${
                        state.attachment === AttachmentType.PIN ? "bg-white shadow-lg text-indigo-600" : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      {t.pin}
                    </button>
                  </div>
                </section>
              </div>
            )}

            {/* LOGO TAB */}
            {activeTab === "logo" && (
              <div className="space-y-10">
                <section>
                  <label className="text-[11px] font-black uppercase block mb-6 tracking-[0.2em] text-slate-900">{t.corporateLogo}</label>
                  <div className="flex flex-col gap-4">
                    <label className="w-full flex flex-col items-center justify-center h-44 border-2 border-dashed border-slate-200 rounded-[2.5rem] bg-slate-50 cursor-pointer hover:border-indigo-600 transition-all shadow-inner overflow-hidden">
                      {state.logo ? (
                        <img src={state.logo} className="h-24 object-contain" alt="Logo preview" />
                      ) : (
                        <div className="flex flex-col items-center gap-4">
                          <Upload size={24} />
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{t.importLogo}</span>
                        </div>
                      )}
                      <input type="file" onChange={handleLogoUpload} className="hidden" accept=".svg,image/*" />
                    </label>

                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        {state.logo && (
                          <button
                            onClick={() => updateState({ logo: null, isLogoVectorized: false, vectorLogoXml: null })}
                            className="flex-1 py-3 bg-red-50 text-red-600 rounded-2xl font-black text-[10px] uppercase border border-red-100"
                          >
                            <Trash2 size={16} className="mx-auto" />
                          </button>
                        )}
                        {rawLogoXML && !isLogoVectorized && (
                          <button
                            onClick={removeLogoBackground}
                            className="flex-1 flex items-center justify-center gap-2 py-3 px-6 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase hover:bg-slate-200 transition-all border border-slate-200"
                          >
                            <Eraser size={16} />
                            {t.cleanBg}
                          </button>
                        )}
                      </div>

                      {state.logo && (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <button
                              onClick={handleRemoveBgAndFit}
                              disabled={isProcessingRbg}
                              className="flex-1 flex items-center justify-center gap-2 py-3 px-6 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-[10px] uppercase hover:bg-indigo-100 transition-all border border-indigo-200 disabled:opacity-50 shadow-sm"
                            >
                              <Maximize2 size={16} />
                              {isProcessingRbg ? t.processing : "Remove BG + Fit"}
                            </button>

                            <button
                              onClick={handleVectorizeLogo}
                              disabled={isVectorizing}
                              className={`flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-2xl font-black text-[10px] uppercase transition-all border ${
                                isLogoVectorized ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700 shadow-md"
                              }`}
                            >
                              {isVectorizing ? <Loader2 size={16} className="animate-spin" /> : <Maximize size={16} />}
                              {isLogoVectorized ? t.refreshVector : t.vectorizeLogo}
                            </button>
                          </div>

                          {isLogoVectorized && (
                            <div className="bg-slate-50 p-6 rounded-[2.5rem] border border-slate-200 animate-in">
                              <label className="text-[11px] font-black uppercase block mb-4 tracking-[0.2em] text-slate-900">{t.logoColorMonochrome}</label>
                              <div className="flex flex-wrap gap-2 items-center mb-4">
                                <button onClick={() => handleLogoColorChange("#000000")} className="flex-1 py-3 bg-black text-white rounded-xl font-black text-[10px] uppercase shadow-lg">
                                  {t.black}
                                </button>
                                <button
                                  onClick={() => handleLogoColorChange("#ffffff")}
                                  className="flex-1 py-3 bg-white text-black border-2 border-slate-200 rounded-xl font-black text-[10px] uppercase shadow-sm"
                                >
                                  {t.white}
                                </button>
                                <div className="flex-1 h-12 bg-white border-2 border-slate-200 rounded-xl overflow-hidden relative shadow-inner">
                                  <input
                                    type="color"
                                    value={state.logoColor}
                                    onChange={(e) => handleLogoColorChange(e.target.value)}
                                    className="absolute inset-2 w-[calc(100%-16px)] h-[calc(100%-16px)] cursor-pointer bg-transparent border-0"
                                  />
                                </div>
                              </div>
                              <input
                                type="text"
                                value={state.logoColor.toUpperCase()}
                                onChange={(e) => handleLogoColorChange(e.target.value)}
                                className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl text-center font-black text-xs uppercase outline-none focus:border-indigo-600"
                              />
                            </div>
                          )}

                          {(isProcessingRbg || isVectorizing) && (
                            <p className="text-[9px] font-bold text-indigo-400 text-center uppercase tracking-widest animate-pulse">{t.processing}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section>
                  <label className="text-[11px] font-black uppercase block mb-6 tracking-[0.2em] text-slate-900">{t.customBackground}</label>
                  <div className="space-y-4">
                    <label className="w-full flex flex-col items-center justify-center h-44 border-2 border-dashed border-slate-200 rounded-[2.5rem] bg-slate-50 cursor-pointer hover:border-indigo-600 transition-all shadow-inner overflow-hidden">
                      {state.background ? (
                        <img src={state.background} className="w-full h-full object-cover" alt="Background preview" />
                      ) : (
                        <div className="flex flex-col items-center gap-4">
                          <ImageIcon size={24} />
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">{t.importBackground}</span>
                        </div>
                      )}
                      <input type="file" onChange={handleBackgroundUpload} className="hidden" accept="image/*" />
                    </label>

                    {state.background && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <span className="text-[10px] font-black uppercase text-slate-400 w-24">{t.opacity}</span>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={state.backgroundOpacity}
                            onChange={(e) => updateState({ backgroundOpacity: parseFloat(e.target.value) })}
                            className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none accent-indigo-600"
                          />
                        </div>
                        <button onClick={() => updateState({ background: null })} className="w-full py-3 bg-red-50 text-red-600 rounded-2xl font-black text-[10px] uppercase border border-red-100">
                          {t.removeDesign}
                        </button>
                      </div>
                    )}
                  </div>
                </section>

                {state.logo && (
                  <section className="bg-white rounded-[2.5rem] border border-indigo-100 shadow-2xl p-8 space-y-8">
                    <div className="space-y-6">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900">{t.logoDimension}</label>
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">{state.logoScale}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="200"
                        value={state.logoScale}
                        onChange={(e) => updateLogoState({ logoScale: parseInt(e.target.value) })}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none accent-indigo-600"
                      />
                    </div>

                    <div className="space-y-6">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900">{t.logoTextSpacing}</label>
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">{state.logoGap}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={state.logoGap}
                        onChange={(e) => updateLogoState({ logoGap: parseInt(e.target.value) })}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none accent-indigo-600"
                      />
                    </div>

                    <div className="space-y-6 border-t pt-6">
                      <div className="flex justify-between items-center">
                        <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-900">{t.logoMarginBorder}</label>
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                          {formatDimension(state.logoMargin, state.dimensions.unit)} {state.dimensions.unit.toUpperCase()}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="20"
                        step="0.5"
                        value={state.logoMargin}
                        onChange={(e) => updateLogoState({ logoMargin: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none accent-indigo-600"
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase text-slate-400 pl-2">{t.logoOffset} X</label>
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateLogoState({ logoOffsetX: state.logoOffsetX - 1 })} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200">
                              -
                            </button>
                            <span className="flex-1 text-center font-black text-[10px]">{formatDimension(state.logoOffsetX, state.dimensions.unit)}</span>
                            <button onClick={() => updateLogoState({ logoOffsetX: state.logoOffsetX + 1 })} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200">
                              +
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase text-slate-400 pl-2">{t.logoOffset} Y</label>
                          <div className="flex items-center gap-2">
                            <button onClick={() => updateLogoState({ logoOffsetY: state.logoOffsetY - 1 })} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200">
                              -
                            </button>
                            <span className="flex-1 text-center font-black text-[10px]">{formatDimension(state.logoOffsetY, state.dimensions.unit)}</span>
                            <button onClick={() => updateLogoState({ logoOffsetY: state.logoOffsetY + 1 })} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200">
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t">
                      <label className="text-[11px] font-black uppercase block mb-6 tracking-[0.2em] text-slate-900">{t.logoPositioning}</label>
                      <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-[2rem] border shadow-inner">
                        {[
                          { pos: "top-left", icon: MoveUpLeft },
                          { pos: "top", icon: MoveUp },
                          { pos: "top-right", icon: MoveUpRight },
                          { pos: "left", icon: MoveLeft },
                          { pos: "center", icon: Target },
                          { pos: "right", icon: MoveRight },
                          { pos: "bottom-left", icon: MoveDownLeft },
                          { pos: "bottom", icon: MoveDown },
                          { pos: "bottom-right", icon: MoveDownRight },
                        ].map(({ pos, icon: Icon }) => (
                          <button
                            key={pos}
                            onClick={() => updateLogoState({ logoPos: pos as any })}
                            className={`p-4 rounded-xl flex items-center justify-center transition-all ${
                              state.logoPos === pos ? "bg-indigo-600 text-white shadow-lg" : "text-slate-300 hover:text-slate-500 hover:bg-white"
                            }`}
                          >
                            <Icon size={24} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* STYLE TAB (NAME+TITLE SIZES ARE HERE — kept) */}
            {activeTab === "style" && (
              <div className="space-y-6 animate-in">
                <div
                  className={`rounded-[2.5rem] p-6 flex items-center gap-4 shadow-sm mx-2 transition-all duration-300 border-2 ${
                    isIndividualMode ? "bg-[#f1f5f9] border-slate-200 shadow-inner" : "bg-[#fff9e6] border-[#ffcc00] shadow-md"
                  }`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg transition-all duration-300 ${isIndividualMode ? "bg-slate-500" : "bg-orange-400"}`}>
                    {isIndividualMode ? <SlidersHorizontal size={20} /> : <Lock size={20} />}
                  </div>
                  <div>
                    <h4 className={`text-[11px] font-black uppercase tracking-tighter transition-all duration-300 ${isIndividualMode ? "text-slate-600" : "text-[#854d0e]"}`}>
                      {isIndividualMode ? t.individualStyle : t.globalStyle}
                    </h4>
                    <p className={`text-[8px] font-bold uppercase transition-all duration-300 ${isIndividualMode ? "text-slate-400" : "text-[#a16207]"}`}>
                      {isIndividualMode ? t.editOnlyThisBadge : t.editAllBadges}
                    </p>
                  </div>
                  <div className="ml-auto flex items-center">
                    <button
                      onClick={() => setIsIndividualMode(!isIndividualMode)}
                      className={`relative w-14 h-8 rounded-full transition-all duration-300 border-2 ${isIndividualMode ? "bg-[#64748b] border-slate-300" : "bg-white border-slate-200 shadow-inner"}`}
                    >
                      <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${isIndividualMode ? "left-7" : "left-1"}`} />
                    </button>
                  </div>
                </div>

                <div className="px-2 space-y-8 pb-20">
                  {/* FONT SECTION (Updated to match screenshot) */}
                  <section className="space-y-4">
                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-[0.2em] pl-6">
                      {t.fontLabel}
                    </label>
                    <div className="space-y-3 px-2">
                      <div className="relative group">
                        <select
                          value={activeStyle.fontFamily}
                          onChange={(e) => updateStyleSetting({ fontFamily: e.target.value })}
                          className="w-full p-6 bg-white border-2 border-slate-50 rounded-[2rem] text-[13px] font-black uppercase outline-none focus:border-indigo-600 shadow-sm appearance-none transition-all cursor-pointer text-center tracking-wider"
                        >
                          {FONTS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                          {customFonts.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300 group-focus-within:text-indigo-600 transition-all">
                          <ChevronRight size={18} />
                        </div>
                      </div>

                      <button
                        onClick={() => fontInputRef.current?.click()}
                        className="w-full py-5 bg-slate-50 text-slate-500 rounded-[2rem] font-black text-[11px] uppercase hover:bg-slate-100 transition-all flex items-center justify-center gap-3 border border-slate-100 shadow-sm group"
                      >
                        <Upload size={16} className="group-hover:-translate-y-0.5 transition-transform" />
                        {t.importFont}
                      </button>
                      <input
                        type="file"
                        ref={fontInputRef}
                        onChange={handleFontUpload}
                        className="hidden"
                        accept=".ttf,.otf,.woff,.woff2"
                      />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-4">{t.textAlignment}</label>
                    <div className="flex gap-1 p-2 bg-[#f1f5f9] rounded-[2rem] border-2 border-slate-100">
                      {(["left", "center", "right"] as const).map((align) => (
                        <button
                          key={align}
                          onClick={() => updateStyleSetting({ alignment: align })}
                          className={`flex-1 py-4 rounded-[1.5rem] flex items-center justify-center transition-all ${
                            activeStyle.alignment === align ? "bg-white shadow-lg text-indigo-600 scale-[1.02]" : "text-slate-400 hover:text-slate-600"
                          }`}
                        >
                          {align === "left" && <AlignLeft size={20} />}
                          {align === "center" && <AlignCenter size={20} />}
                          {align === "right" && <AlignRight size={20} />}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="space-y-4">
                    <div className="p-4 bg-[#f8fafc] rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-sm">
                      <div className="flex items-center">
                        <div className="w-12 h-12 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                          <Layout size={20} className="rotate-90" />
                        </div>
                        <div className="ml-4">
                          <h4 className="text-[11px] font-black uppercase tracking-tighter text-slate-900">{t.lineBreak}</h4>
                          <p className="text-[8px] font-bold uppercase text-slate-400">{t.dynamicMultiline}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => updateStyleSetting({ isMultiline: !activeStyle.isMultiline })}
                        className={`relative w-12 h-7 rounded-full transition-all duration-300 ${activeStyle.isMultiline ? "bg-emerald-500" : "bg-slate-200"}`}
                      >
                        <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ${activeStyle.isMultiline ? "left-6" : "left-1"}`} />
                      </button>
                    </div>
                  </section>

                  <div className="h-[2px] bg-slate-50 w-full" />

                  {/* NAME SIZE (restored) */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                        <Type size={18} />
                      </div>
                      <h3 className="text-[11px] font-black uppercase tracking-widest">{t.nameStyle}</h3>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-center px-4">
                        <label className="text-[9px] font-black uppercase text-slate-400">{t.fontSize}</label>
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{activeStyle.nameSize}PX</span>
                      </div>
                      <input
                        type="range"
                        min="12"
                        max="64"
                        value={activeStyle.nameSize}
                        onChange={(e) => updateStyleSetting({ nameSize: parseInt(e.target.value) })}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none accent-indigo-600"
                      />
                    </div>

                    <div className="flex items-end gap-4">
                      <div className="flex-1 space-y-3">
                        <label className="text-[9px] font-black uppercase text-slate-400 px-4">{t.color}</label>
                        <div className="relative h-14 bg-white border-2 border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:border-indigo-600 transition-all">
                          <input
                            type="color"
                            value={activeStyle.nameColor}
                            onChange={(e) => updateStyleSetting({ nameColor: e.target.value })}
                            className="absolute inset-2 w-[calc(100%-16px)] h-[calc(100%-16px)] cursor-pointer bg-transparent border-0"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => updateStyleSetting({ bold: !activeStyle.bold })}
                        className={`h-14 px-8 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                          activeStyle.bold ? "bg-indigo-600 text-white shadow-xl shadow-indigo-200" : "bg-slate-100 text-slate-400 border border-slate-200"
                        }`}
                      >
                        {t.boldText}
                      </button>
                    </div>
                  </section>

                  <div className="h-[2px] bg-slate-50 w-full" />

                  {/* TITLE SIZE (restored) */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#1e293b] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-slate-100">
                        <Layout size={18} />
                      </div>
                      <h3 className="text-[11px] font-black uppercase tracking-widest">{t.titleStyle}</h3>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between items-center px-4">
                        <label className="text-[9px] font-black uppercase text-slate-400">{t.fontSize}</label>
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{activeStyle.titleSize}PX</span>
                      </div>
                      <input
                        type="range"
                        min="8"
                        max="48"
                        value={activeStyle.titleSize}
                        onChange={(e) => updateStyleSetting({ titleSize: parseInt(e.target.value) })}
                        className="w-full h-2 bg-slate-100 rounded-lg appearance-none accent-slate-900"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[9px] font-black uppercase text-slate-400 px-4">{t.color}</label>
                      <div className="relative h-14 bg-white border-2 border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:border-slate-400 transition-all">
                        <input
                          type="color"
                          value={activeStyle.titleColor}
                          onChange={(e) => updateStyleSetting({ titleColor: e.target.value })}
                          className="absolute inset-2 w-[calc(100%-16px)] h-[calc(100%-16px)] cursor-pointer bg-transparent border-0"
                        />
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      <footer className="h-10 bg-slate-950 text-white flex items-center px-6 justify-between text-[9px] font-black uppercase tracking-[0.25em] z-50">
        <div className="flex gap-10">
          <span className="flex items-center gap-2">
            {activeErrorsCount > 0 ? <AlertTriangle size={14} className="text-red-500 animate-pulse" /> : <CheckCircle2 size={14} className="text-emerald-400" />}
            <span>{activeErrorsCount > 0 ? `${activeErrorsCount} ${t.errorsDetected}` : t.systemReady}</span>
          </span>
          <span className="text-slate-400">{state.items.length} {t.badgesProgrammed}</span>
        </div>
        <div className="flex items-center gap-3 text-slate-600">
          <Cpu size={12} className="text-indigo-600 shadow-lg shadow-indigo-500/50" /> {t.studioPro}
        </div>
      </footer>

      {/* AI ASSISTANT */}
      <div className="fixed bottom-16 right-6 z-[60] flex flex-col items-end gap-4">
        {isAiOpen && (
          <div className="w-80 h-[450px] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            <header className="p-4 bg-indigo-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Bot size={20} />
                <span className="text-xs font-black uppercase tracking-widest">{t.aiAssistant}</span>
              </div>
              <button onClick={() => setIsAiOpen(false)} className="p-1 hover:bg-white/20 rounded-lg transition-all">
                <X size={16} />
              </button>
            </header>
            <div ref={aiChatRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {aiMessages.length === 0 && (
                <div className="text-center py-10 space-y-4">
                  <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
                    <Sparkle size={24} />
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4">
                    {t.aiWelcome}
                  </p>
                </div>
              )}
              {aiMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] p-3 rounded-2xl text-[11px] leading-relaxed ${
                      m.role === "user" ? "bg-indigo-600 text-white rounded-tr-none" : "bg-white border text-slate-700 rounded-tl-none shadow-sm"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {isAiLoading && (
                <div className="flex justify-start">
                  <div className="bg-white border p-3 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                    <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce" />
                    <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
            </div>
            <div className="p-3 border-t bg-white flex gap-2">
              <input
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAiChat()}
                placeholder={t.aiPlaceholder}
                className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2 text-xs outline-none focus:ring-2 ring-indigo-500/20"
              />
              <button
                onClick={handleAiChat}
                disabled={isAiLoading}
                className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
        <button
          onClick={() => setIsAiOpen(!isAiOpen)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 ${
            isAiOpen ? "bg-white text-indigo-600 border border-slate-200" : "bg-indigo-600 text-white"
          }`}
        >
          {isAiOpen ? <X size={24} /> : <Bot size={28} />}
        </button>
      </div>

      {/* IMPORT MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/70 backdrop-blur-md animate-in">
          <div className="bg-white w-full max-w-3xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200">
            <header className="p-8 border-b flex justify-between items-center bg-slate-50">
              <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">{t.batchImport}</h2>
              <button onClick={() => setIsImportModalOpen(false)} className="p-3 hover:bg-rose-50 hover:text-rose-600 rounded-2xl transition-all">
                <X />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-10 space-y-10">
              {importData.length === 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="group p-12 rounded-[2.5rem] border-4 border-dashed border-slate-200 flex flex-col items-center justify-center gap-6 bg-slate-50 cursor-pointer hover:border-indigo-600 hover:bg-indigo-50 transition-all shadow-inner"
                  >
                    <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-indigo-600 shadow-xl group-hover:scale-110 transition-all">
                      <FileSpreadsheet size={32} />
                    </div>
                    <div className="text-center">
                      <p className="text-[13px] font-black uppercase tracking-widest text-slate-900">{t.excelCsvFile}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-2 tracking-widest uppercase">{t.dragDataHere}</p>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleFileUploadSpreadsheet} className="hidden" accept=".xlsx,.xls,.csv" />
                  </div>

                  <div className="p-10 rounded-[2.5rem] bg-slate-100/50 flex flex-col gap-6 shadow-inner border border-slate-200">
                    <textarea
                      value={pasteValue}
                      onChange={(e) => setPasteValue(e.target.value)}
                      placeholder="JEAN DUPONT - MANAGER"
                      className="flex-1 p-5 bg-white border border-slate-200 rounded-3xl text-xs font-bold min-h-[150px] shadow-sm outline-none focus:ring-4 ring-indigo-500/10 transition-all"
                    />
                    <button
                      onClick={handlePasteImport}
                      className="py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-[11px] uppercase shadow-xl hover:bg-indigo-700 active:scale-95 transition-all"
                    >
                      {t.analyzeRawList}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-8 animate-in">
                  <h3 className="text-[14px] font-black uppercase text-indigo-600 tracking-widest px-1 flex items-center gap-3">
                    <Layout size={20} /> {t.dataMapping}
                  </h3>
                  {["firstName", "lastName", "title"].map((field) => (
                    <div key={field} className="flex items-center justify-between p-6 bg-slate-50 rounded-[2rem] border shadow-sm">
                      <span className="uppercase text-[11px] font-black text-slate-600">
                        {field === "firstName" ? t.firstName : field === "lastName" ? t.lastName : t.jobTitle}
                      </span>
                      <select
                        value={mapping[field] ?? ""}
                        onChange={(e) => setMapping({ ...mapping, [field]: parseInt(e.target.value) })}
                        className="p-3 border-2 border-slate-200 rounded-xl text-[11px] font-black uppercase bg-white outline-none focus:ring-4 ring-indigo-500/10 min-w-[180px] shadow-sm"
                      >
                        <option value="">-- {t.ignore} --</option>
                        {importData[0].map((h: any, i: number) => (
                          <option key={i} value={i}>
                            COL {i + 1} : {String(h).substring(0, 15)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <footer className="p-8 bg-slate-50 border-t flex justify-end gap-4">
              <button onClick={() => { setImportData([]); setMapping({}); }} className="px-8 py-4 font-black text-[10px] uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest">
                {t.clear}
              </button>
              <button
                onClick={finalizeImport}
                disabled={importData.length === 0}
                className="px-14 py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-[12px] uppercase shadow-2xl hover:bg-indigo-700 disabled:opacity-50 transition-all tracking-widest"
              >
                {t.generateEngravingSeries}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;