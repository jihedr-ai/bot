
import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { 
  Trash2, Download, Plus, Type, ChevronLeft, ChevronRight, 
  Users, Palette, Info, Layout, Box, Zap, FileText, Image as ImageIcon,
  CheckCircle2, AlignCenter, AlignLeft, AlignRight, Eye, FileSpreadsheet,
  Lock, Unlock, Upload, Maximize, Ruler, Check, Clipboard, X, Search,
  MoveUpLeft, MoveUp, MoveUpRight, MoveLeft, Target, MoveRight, MoveDownLeft, MoveDown, MoveDownRight,
  Maximize2, Minimize2, Loader2, FileCode, AlertTriangle, Cpu, MousePointer2,
  Settings, Bold, Eraser, SlidersHorizontal, CheckCircle, Sparkles, Move, Scissors
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as pdfjs from 'pdfjs-dist';

// Initialize PDF.js worker using the version from the package
const PDFJS_VERSION = '5.5.207';
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

import { 
  MaterialFamily, ShapeType, AttachmentType, TagStyle, 
  NametagItem, StudioState, PlasticColor, MetalFinish, CustomShape 
} from './types';
import { 
  PLASTIC_COLORS, METAL_FINISHES, FONTS, DEFAULT_STYLE, PRICING 
} from './constants';

// --- Unit Conversion Helpers ---
const IN_TO_MM = 25.4;
const MM_TO_IN = 1 / 25.4;

const mmToIn = (mm: number) => mm * MM_TO_IN;
const inToMm = (inch: number) => inch * IN_TO_MM;

const parseUserDimension = (input: string, currentUnit: 'in' | 'mm'): number => {
  const cleanInput = input.toLowerCase().trim();
  const value = parseFloat(cleanInput.replace(',', '.'));
  if (isNaN(value)) return 0;
  if (cleanInput.endsWith('in') || cleanInput.endsWith('"')) return inToMm(value);
  if (cleanInput.endsWith('mm')) return value;
  return currentUnit === 'in' ? inToMm(value) : value;
};

const formatDimension = (mmValue: number, currentUnit: 'in' | 'mm'): string => {
  if (currentUnit === 'in') {
    const val = mmToIn(mmValue);
    return Number(val.toFixed(3)).toString();
  }
  return Number(mmValue.toFixed(2)).toString();
};

// --- Helper: Path Normalization ---
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

// --- Outermost Cutline Extraction ---
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

// --- Spelling / Typo Helpers ---
const NAMETAG_DICTIONARY = ['ALEXANDRE', 'MARIE', 'JEAN', 'PIERRE', 'SÉBASTIEN', 'ÉMILIE', 'FRANÇOIS', 'NICOLAS', 'BENOÎT', 'STÉPHANE', 'TREMBLAY', 'DUPONT', 'MARTIN', 'BOUCHARD', 'GAGNON', 'ROY', 'COUTU', 'LEFEBVRE', 'MORIN', 'LABERGE'];
const normalizeStr = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
      else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
};
const findTypoSuggestion = (text: string, roster: string[] = [], isTitle: boolean = false): { suggestion: string; confidence: number } | null => {
  const userValue = text.trim(); if (!userValue || userValue.length < 3) return null;
  const normalizedUser = normalizeStr(userValue);
  const dict = isTitle ? Array.from(new Set([...roster])) : Array.from(new Set([...NAMETAG_DICTIONARY, ...roster]));
  let bestMatch: string | null = null; let maxConfidence = 0;
  for (const word of dict) {
    const wordUpper = word.toUpperCase(); const normalizedWord = normalizeStr(wordUpper);
    const dist = getLevenshteinDistance(normalizedUser, normalizedWord);
    const similarity = 1 - (dist / Math.max(normalizedUser.length, normalizedWord.length));
    if (similarity > maxConfidence) { maxConfidence = similarity; bestMatch = wordUpper; }
  }
  if (bestMatch && maxConfidence >= 0.8) return { suggestion: bestMatch, confidence: maxConfidence };
  return null;
};

const waitAssetsReady = async (containerId: string) => {
  const container = document.getElementById(containerId); if (!container) return;
  const imgs = Array.from(container.querySelectorAll('img'));
  await Promise.all(imgs.map(img => { if (img.complete) return Promise.resolve(); return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; }); }));
  await document.fonts.ready;
};

const App: React.FC = () => {
  const [state, setState] = useState<StudioState>({
    items: [
      { id: 'WVTX0KLF', firstName: 'JEAN-SÉBASTIEN', lastName: 'TREMBLAY', title: 'CHEF DE PROJET', quantity: 1 },
      { id: 'HZHKW8V4', firstName: 'MARIE', lastName: 'TREMBLAY', title: 'DESIGNER GRAPHIQUE', quantity: 1 },
    ],
    selectedIndex: 0,
    material: MaterialFamily.METAL,
    shape: ShapeType.STANDARD,
    customShape: null,
    attachment: AttachmentType.MAGNET,
    metalFinish: METAL_FINISHES[0].name,
    metalThickness: '0.020',
    plasticColor: PLASTIC_COLORS[0].name,
    roundedCorners: true,
    cornerRadius: 6.35, 
    logo: null,
    logoScale: 100,
    logoPos: 'top',
    logoGap: 16,
    logoMargin: 12, 
    logoOffsetX: 0,
    logoOffsetY: 0,
    background: null,
    backgroundOpacity: 1,
    globalStyle: { ...DEFAULT_STYLE },
    isSameContent: false,
    dimensions: { width: 76.2, height: 38.1, unit: 'in' },
    logoColor: '#000000',
    isLogoVectorized: false,
    vectorLogoXml: null,
  });

  const [isIndividualMode, setIsIndividualMode] = useState(false);
  const [isVectorizing, setIsVectorizing] = useState(false);
  const [widthInput, setWidthInput] = useState(formatDimension(76.2, 'in'));
  const [heightInput, setHeightInput] = useState(formatDimension(38.1, 'in'));
  const [customFonts, setCustomFonts] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'product' | 'logo' | 'style'>('product');
  const [showProof, setShowProof] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'svg'>('pdf');
  const [invalidIds, setInvalidIds] = useState<Set<string>>(new Set());
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [isProcessingRbg, setIsProcessingRbg] = useState(false);
  const [logoRatio, setLogoRatio] = useState<number>(1);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<{ [key: string]: any }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const shapeInputRef = useRef<HTMLInputElement>(null);
  const [pasteValue, setPasteValue] = useState('');

  useEffect(() => { setWidthInput(formatDimension(state.dimensions.width, state.dimensions.unit)); setHeightInput(formatDimension(state.dimensions.height, state.dimensions.unit)); }, [state.dimensions.unit]);
  const updateState = (updates: Partial<StudioState>) => setState(prev => ({ ...prev, ...updates }));
  const currentItem = useMemo(() => state.items[state.selectedIndex] || state.items[0], [state.items, state.selectedIndex]);
  
  // FIX: Moved getActiveStyle up to use it in activeStyle
  const getActiveStyle = (item: NametagItem): TagStyle => ({ ...state.globalStyle, ...(item.overrides || {}) });
  const activeStyle = getActiveStyle(currentItem);

  const rosterData = useMemo(() => {
    return { firstNames: Array.from(new Set(state.items.map(i => i.firstName).filter(v => v))), lastNames: Array.from(new Set(state.items.map(i => i.lastName).filter(v => v))), titles: Array.from(new Set(state.items.map(i => i.title).filter(v => v))) };
  }, [state.items]);

  // FIX: Added triggerTypoCheck helper
  const triggerTypoCheck = (item: NametagItem): NametagItem => {
    const fSug = findTypoSuggestion(item.firstName, rosterData.firstNames);
    const lSug = findTypoSuggestion(item.lastName, rosterData.lastNames);
    const tSug = findTypoSuggestion(item.title, rosterData.titles, true);
    const typoSuggestions: NametagItem['typoSuggestions'] = { ...item.typoSuggestions };
    if (fSug) typoSuggestions.firstName = { ...fSug, original: item.firstName, dismissed: false };
    if (lSug) typoSuggestions.lastName = { ...lSug, original: item.lastName, dismissed: false };
    if (tSug) typoSuggestions.title = { ...tSug, original: item.title, dismissed: false };
    return { ...item, typoSuggestions };
  };

  const activeErrorsCount = useMemo(() => { let count = 0; invalidIds.forEach(id => { if (!acceptedIds.has(id)) count++; }); return count; }, [invalidIds, acceptedIds]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    
    if (file.type === 'application/pdf') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const scale = 2;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/png');
        const img = new Image();
        img.onload = () => {
          setLogoRatio(img.width / img.height || 1);
          updateState({ logo: dataUrl, isLogoVectorized: false, vectorLogoXml: null });
        };
        img.src = dataUrl;
      } catch (err) {
        console.error("Error loading PDF:", err);
        alert("Erreur lors de l'import du PDF.");
      }
      return;
    }

    if (file.type === 'image/svg+xml') {
      reader.onload = (re) => {
        const xml = re.target?.result as string; 
        // Use a more robust way to create data URL for SVG
        const blob = new Blob([xml], { type: 'image/svg+xml' });
        const dataUrl = URL.createObjectURL(blob);
        
        const img = new Image(); 
        img.onload = () => { 
          setLogoRatio(img.width / img.height || 1); 
          // Convert to base64 for state persistence if needed, or keep as blob URL
          // For now, let's use base64 to match existing pattern but more robustly
          const readerBase64 = new FileReader();
          readerBase64.onloadend = () => {
            updateState({ logo: readerBase64.result as string, isLogoVectorized: true, vectorLogoXml: xml });
          };
          readerBase64.readAsDataURL(blob);
        }; 
        img.src = dataUrl;
      }; reader.readAsText(file);
    } else {
      reader.onload = (re) => {
        const result = re.target?.result as string; const img = new Image();
        img.onload = () => { setLogoRatio(img.width / img.height || 1); updateState({ logo: result, isLogoVectorized: false, vectorLogoXml: null }); }; img.src = result;
      }; reader.readAsDataURL(file);
    }
  };

  const handleCustomShapeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader(); reader.onload = (re) => {
        const xml = re.target?.result as string; const doc = new DOMParser().parseFromString(xml, "image/svg+xml");
        const result = selectCutlineFromSvg(doc); if (!result) { alert("Impossible d'extraire un contour fermé."); return; }
        updateState({ customShape: { sourceType: "svg", outlinePathD: result.d, normalizedPathD: normalizePathData(result.d, result.viewBox), viewBox: result.viewBox, originalAspect: result.viewBox.w / result.viewBox.h }, shape: ShapeType.CUSTOM });
      }; reader.readAsText(file);
    } else if (file.type === 'application/pdf') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        const d = traceImageOutline(canvas); 
        updateState({ 
          customShape: { 
            sourceType: "raster", 
            outlinePathD: d, 
            normalizedPathD: normalizePathData(d, { minX: 0, minY: 0, w: canvas.width, h: canvas.height }), 
            viewBox: { minX: 0, minY: 0, w: canvas.width, h: canvas.height }, 
            originalAspect: canvas.width / canvas.height 
          }, 
          shape: ShapeType.CUSTOM 
        });
      } catch (err) {
        console.error("Error loading PDF for shape:", err);
        alert("Erreur lors de l'import du PDF pour la forme.");
      }
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader(); reader.onload = (re) => {
        const img = new Image(); img.onload = () => {
          const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
          const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.drawImage(img, 0, 0);
          const d = traceImageOutline(canvas); updateState({ customShape: { sourceType: "raster", outlinePathD: d, normalizedPathD: normalizePathData(d, { minX: 0, minY: 0, w: img.width, h: img.height }), viewBox: { minX: 0, minY: 0, w: img.width, h: img.height }, originalAspect: img.width / img.height }, shape: ShapeType.CUSTOM });
        }; img.src = re.target?.result as string;
      }; reader.readAsDataURL(file);
    }
  };

  const handleFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fontName = `Custom-${file.name.split('.')[0]}`; const fontUrl = URL.createObjectURL(file);
    const fontFace = new FontFace(fontName, `url(${fontUrl})`); fontFace.load().then(loadedFace => { document.fonts.add(loadedFace); setCustomFonts(prev => [...prev, fontName]); updateStyleSetting({ fontFamily: fontName }); }).catch(() => alert("Erreur de police."));
  };

  const handleVectorizeLogo = async () => {
    if (!state.logo || isVectorizing) return; setIsVectorizing(true);
    try {
      const img = new Image(); img.crossOrigin = "anonymous"; img.src = state.logo; await new Promise((res) => img.onload = res);
      const svgText = `<svg viewBox="0 0 ${img.width} ${img.height}" xmlns="http://www.w3.org/2000/svg"><rect width="${img.width}" height="${img.height}" fill="${state.logoColor}" /></svg>`;
      updateState({ isLogoVectorized: true, vectorLogoXml: svgText });
    } finally { setIsVectorizing(false); }
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) { const r = new FileReader(); r.onload = (ev) => updateState({ background: ev.target?.result as string }); r.readAsDataURL(file); }
  };

  async function handleRemoveBgAndFit() {
    if (!state.logo || isProcessingRbg) return; setIsProcessingRbg(true);
    try {
      const img = new Image(); img.src = state.logo; await new Promise((res) => img.onload = res);
      const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
      if (canvas.getContext('2d')) { canvas.getContext('2d')?.drawImage(img, 0, 0); updateState({ logo: canvas.toDataURL('image/png') }); }
    } finally { setIsProcessingRbg(false); }
  }

  const NametagPreview: React.FC<{ item: NametagItem; scale?: number; isPrint?: boolean; onQCChange?: (id: string, isValid: boolean) => void; isValidator?: boolean; }> = ({ item, scale = 1, isPrint = false, onQCChange, isValidator = false }) => {
    const finish = METAL_FINISHES.find(f => f.name === state.metalFinish) || METAL_FINISHES[0];
    const plastic = PLASTIC_COLORS.find(c => c.name === state.plasticColor) || PLASTIC_COLORS[0];
    const style = getActiveStyle(item);
    const bgColor = state.material === MaterialFamily.METAL ? finish.bgColor : plastic.bgColor;
    const bgStyle = state.material === MaterialFamily.METAL ? finish.gradient : 'none';
    const containerRef = useRef<HTMLDivElement>(null);
    const nameRef = useRef<HTMLHeadingElement>(null);
    const titleRef = useRef<HTMLParagraphElement>(null);
    const logoRef = useRef<HTMLDivElement>(null);
    const [isInternalValid, setIsInternalValid] = useState(true);
    const isCustom = state.shape === ShapeType.CUSTOM && !!state.customShape;
    const clipId = `clip-shape-${item.id}-${isPrint ? 'p' : 'v'}`;
    const targetW = state.dimensions.width; const targetH = state.dimensions.height;
    const dimW_px = mmToIn(targetW) * 100 * scale; const dimH_px = mmToIn(targetH) * 100 * scale;
    const safeInsetMm = 2.5; 
    const sScaleX = (targetW - (safeInsetMm * 2)) / targetW; const sScaleY = (targetH - (safeInsetMm * 2)) / targetH;
    const sTransX = safeInsetMm / targetW; const sTransY = safeInsetMm / targetH;

    // Logo Logic
    const isHorizontal = state.logoPos === 'left' || state.logoPos === 'right' || state.logoPos.includes('left') || state.logoPos.includes('right');
    const flexDir = isHorizontal 
      ? (state.logoPos.includes('right') ? 'flex-row-reverse' : 'flex-row')
      : (state.logoPos === 'bottom' ? 'flex-col-reverse' : 'flex-col');
    
    const autoAlign = isHorizontal 
      ? (state.logoPos.includes('right') ? 'items-end text-right' : 'items-start text-left')
      : 'items-center text-center';

    const baseDimMm = Math.min(targetW, targetH);
    const finalLW_mm = baseDimMm * (state.logoScale / 100) * 0.7;
    const finalLH_mm = finalLW_mm / logoRatio;

    const validateProduction = () => {
      if (!containerRef.current || !nameRef.current || !titleRef.current) return;
      const cRect = containerRef.current.getBoundingClientRect(); const nRect = nameRef.current.getBoundingClientRect(); const tRect = titleRef.current.getBoundingClientRect();
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
      if (canvas.getContext('2d')) {
        const pathData = isCustom ? state.customShape!.normalizedPathD : "M0 0 H1 V1 H0 Z";
        const path = new Path2D(pathData);
        const check = (r: DOMRect) => [{x:r.left,y:r.top},{x:r.right,y:r.top},{x:r.left,y:r.bottom},{x:r.right,y:r.bottom},{x:(r.left+r.right)/2,y:(r.top+r.bottom)/2}].every(p => {
          const rx = (p.x-cRect.left)/cRect.width, ry = (p.y-cRect.top)/cRect.height;
          canvas.getContext('2d')?.save(); canvas.getContext('2d')?.translate(sTransX, sTransY); canvas.getContext('2d')?.scale(sScaleX, sScaleY);
          const inside = canvas.getContext('2d')?.isPointInPath(path, rx, ry); canvas.getContext('2d')?.restore();
          return inside;
        });
        const valid = check(nRect) && check(tRect) && (!logoRef.current || check(logoRef.current.getBoundingClientRect()));
        setIsInternalValid(valid); if (onQCChange) onQCChange(item.id, valid);
      }
    };
    useLayoutEffect(() => { const timer = setTimeout(validateProduction, 250); return () => clearTimeout(timer); }, [item, state.logo, state.logoScale, state.dimensions, state.shape, state.logoPos, scale, acceptedIds]);

    return (
      <div ref={containerRef} id={isValidator ? `val-${item.id}` : (isPrint ? `badge-print-${item.id}` : "nametag-preview")}
        className={`relative flex transition-all duration-300 badge-render ${!isPrint && !isValidator ? 'shadow-2xl' : ''}`}
        style={{ width: isPrint ? `${mmToIn(targetW)}in` : `${dimW_px}px`, height: isPrint ? `${mmToIn(targetH)}in` : `${dimH_px}px`, borderRadius: !isCustom && state.roundedCorners ? (isPrint ? `${mmToIn(state.cornerRadius)}in` : `${mmToIn(state.cornerRadius)*100*scale}px`) : '0px', clipPath: isCustom ? `url(#${clipId})` : 'none', backgroundColor: isCustom ? 'transparent' : bgColor, background: !isCustom && bgStyle !== 'none' ? bgStyle : 'none' } as React.CSSProperties}
      >
        {isCustom && <svg width="0" height="0" className="absolute"><defs><clipPath id={clipId} clipPathUnits="objectBoundingBox"><path d={state.customShape?.normalizedPathD} /></clipPath></defs></svg>}
        <div className="absolute inset-0 z-0 pointer-events-none" style={{ clipPath: isCustom ? `url(#${clipId})` : 'none', background: bgStyle !== 'none' ? bgStyle : bgColor, backgroundColor: bgColor }}>
          {state.background && <img src={state.background} className="w-full h-full object-cover" style={{ opacity: state.backgroundOpacity }} alt="" />}
        </div>
        {!isPrint && !isValidator && (
          <svg className="absolute inset-0 pointer-events-none w-full h-full z-20" viewBox="0 0 1 1" preserveAspectRatio="none">
             <g transform={`translate(${sTransX}, ${sTransY}) scale(${sScaleX}, ${sScaleY})`}>
               <path d={isCustom ? state.customShape?.normalizedPathD : "M0 0 H1 V1 H0 Z"} fill="none" stroke="rgba(99,102,241,0.2)" strokeWidth="0.005" strokeDasharray="0.02,0.01" />
             </g>
          </svg>
        )}
        {isPrint && <svg className="absolute inset-0 pointer-events-none w-full h-full z-50" viewBox="0 0 1 1" preserveAspectRatio="none"><path d={isCustom ? state.customShape?.normalizedPathD : "M0 0 H1 V1 H0 Z"} fill="none" stroke="red" strokeWidth="0.005" /></svg>}
        <div className={`w-full h-full flex z-10 items-center justify-center ${flexDir}`} style={{ gap: isPrint ? `${(state.logoGap / 100)}in` : `${state.logoGap * scale}px`, padding: `${state.logoMargin*scale}px` }}>
          {state.logo && (
            <div ref={logoRef} className="shrink-0 flex items-center justify-center overflow-hidden" 
              style={{ width: isPrint ? `${mmToIn(finalLW_mm)}in` : `${finalLW_mm * MM_TO_IN * 100 * scale}px`, height: isPrint ? `${mmToIn(finalLH_mm)}in` : `${finalLH_mm * MM_TO_IN * 100 * scale}px`, maxWidth: '100%', maxHeight: '100%', transform: `translate(${isPrint ? mmToIn(state.logoOffsetX) : state.logoOffsetX * scale}px, ${isPrint ? mmToIn(state.logoOffsetY) : state.logoOffsetY * scale}px)` }}>
              <img src={state.logo} className="max-w-full max-h-full object-contain block" alt="" />
            </div>
          )}
          <div className={`flex flex-col justify-center min-w-0 ${style.alignment === 'center' ? 'text-center items-center' : style.alignment === 'right' ? 'text-right items-end' : style.alignment === 'left' ? 'text-left items-start' : autoAlign}`}>
            <h2 className={`uppercase leading-none ${style.isMultiline ? 'whitespace-normal' : 'truncate whitespace-nowrap'}`} style={{ fontFamily: style.fontFamily, fontSize: isPrint ? `${(style.nameSize / 100)}in` : `${style.nameSize * scale}px`, fontWeight: style.bold ? 900 : 700, color: style.nameColor }}>{item.firstName} {item.lastName}</h2>
            <p className={`mt-1 font-medium leading-none ${style.isMultiline ? 'whitespace-normal' : 'truncate whitespace-nowrap'}`} style={{ fontFamily: style.fontFamily, fontSize: isPrint ? `${(style.titleSize / 100)}in` : `${style.titleSize * scale}px`, color: style.titleColor }}>{item.title}</p>
          </div>
        </div>
        {!isInternalValid && !isPrint && !isValidator && !acceptedIds.has(item.id) && (
          <div className="absolute inset-0 bg-red-500/10 border-4 border-red-500 pointer-events-none z-[100] animate-pulse"><div className="absolute top-2 right-2 bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded shadow-lg uppercase">Hors Limites</div></div>
        )}
      </div>
    );
  };

  const handleFinalExport = async () => {
    setIsExporting(true); const was = showProof;
    try {
      if (!was) { setShowProof(true); await new Promise(r => setTimeout(r, 1000)); }
      await waitAssetsReady("bat-grid-container");
      if (exportFormat === 'pdf') {
        const doc = new jsPDF({ orientation: 'p', unit: 'in', format: 'a4' });
        const bW = mmToIn(state.dimensions.width), bH = mmToIn(state.dimensions.height), margin = 0.5; let xp = margin, yp = margin;
        for (let i = 0; i < state.items.length; i++) {
          const el = document.getElementById(`badge-print-${state.items[i].id}`); if (!el) continue;
          const canv = await html2canvas(el, { scale: 4, useCORS: true, logging: false, backgroundColor: null });
          doc.addImage(canv.toDataURL('image/png'), 'PNG', xp, yp, bW, bH, undefined, 'FAST');
          xp += bW + margin; if (xp + bW > 7.8) { xp = margin; yp += bH + margin; if (yp + bH > 10.5 && i < state.items.length-1) { doc.addPage(); yp = margin; } }
        }
        doc.save(`WETAG_PRODUCTION_${Date.now()}.pdf`);
      } else { handleExportSVG(); }
    } finally { setIsExporting(false); if (!was) setShowProof(false); }
  };

  const handleExportSVG = async () => {
    const dpi = 72; const bw = mmToIn(state.dimensions.width) * dpi, bh = mmToIn(state.dimensions.height) * dpi, m = 0.5 * dpi, cols = 2;
    const sw = (cols * bw) + ((cols + 1) * m), sh = Math.ceil(state.items.length/cols) * (bh + m) + m;
    let svg = `<svg width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`;
    svg += `<defs><clipPath id="tagC" clipPathUnits="objectBoundingBox"><path d="${state.shape === ShapeType.CUSTOM ? state.customShape?.normalizedPathD : 'M0 0 H1 V1 H0 Z'}" /></clipPath></defs>`;
    for (let i = 0; i < state.items.length; i++) {
      const x = m + (i % cols) * (bw + m), y = m + Math.floor(i/cols) * (bh + m);
      svg += `<g transform="translate(${x}, ${y})"><g clip-path="url(#tagC)"><rect width="${bw}" height="${bh}" fill="white" /></g></g>`;
    }
    svg += `</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `WETAG_PRODUCTION_${Date.now()}.svg`; link.click();
  };

  const handleQCChange = (id: string, isValid: boolean) => setInvalidIds(prev => { const n = new Set(prev); if (isValid) n.delete(id); else n.add(id); return n; });
  const updateCurrentItem = (updates: Partial<NametagItem>) => { const n = [...state.items]; n[state.selectedIndex] = triggerTypoCheck({ ...n[state.selectedIndex], ...updates }); updateState({ items: n }); };
  const updateStyleSetting = (updates: Partial<TagStyle>) => { if (isIndividualMode) updateCurrentItem({ overrides: { ...getActiveStyle(currentItem), ...updates } }); else updateState({ globalStyle: { ...state.globalStyle, ...updates } }); };
  const addItem = () => { updateState({ items: [...state.items, { id: Math.random().toString(36).substr(2, 8).toUpperCase(), firstName: 'PRÉNOM', lastName: 'NOM', title: 'Titre / Poste', quantity: 1 }], selectedIndex: state.items.length }); };
  const handleDimensionChange = (key: 'width' | 'height', val: string) => { if (key === 'width') setWidthInput(val); else setHeightInput(val); updateState({ dimensions: { ...state.dimensions, [key]: parseUserDimension(val, state.dimensions.unit) } }); };

  const PositionButton = ({ pos, icon }: { pos: StudioState['logoPos']; icon: React.ReactNode }) => (
    <button 
      onClick={() => updateState({ logoPos: pos })}
      className={`p-4 rounded-2xl flex items-center justify-center transition-all ${state.logoPos === pos ? 'bg-indigo-600 text-white shadow-lg scale-105' : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
    >
      {icon}
    </button>
  );

  return (
    <div className="h-screen flex flex-col bg-[#f8fafc] overflow-hidden text-[#0f172a] font-medium">
      <div className="fixed -left-[9999px] top-0 pointer-events-none w-0 h-0 overflow-hidden" aria-hidden="true">{state.items.map(item => ( <NametagPreview key={`v-${item.id}`} item={item} isValidator={true} onQCChange={handleQCChange} /> ))}</div>
      <nav className="h-16 bg-white border-b px-6 flex justify-between items-center z-50 shadow-sm"><div className="flex items-center gap-6"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg">W</div><h1 className="text-lg font-black uppercase tracking-tighter">Wetag <span className="text-indigo-600">Studio</span></h1></div>{activeErrorsCount > 0 && ( <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-full border border-red-200 animate-pulse"><AlertTriangle size={14} /><span className="text-[10px] font-black uppercase">{activeErrorsCount} Erreurs</span></div> )}</div><div className="flex items-center gap-4"><div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl"><button onClick={() => setExportFormat('pdf')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase ${exportFormat === 'pdf' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>PDF</button><button onClick={() => setExportFormat('svg')} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase ${exportFormat === 'svg' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>SVG</button></div><button onClick={() => setShowProof(true)} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase shadow-xl hover:bg-indigo-700 active:scale-95 transition-all"><Download size={18} /> Production</button></div></nav>
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[380px] bg-white border-r flex flex-col shrink-0 shadow-sm z-10"><div className="p-6 border-b space-y-4"><div className="flex items-center justify-between"><h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Série</h3><div className="flex gap-2"><button onClick={() => setIsImportModalOpen(true)} className="p-2 bg-slate-100 rounded-lg border shadow-sm"><FileSpreadsheet size={16}/></button><button onClick={addItem} className="p-2 bg-indigo-600 text-white rounded-lg shadow-md"><Plus size={16} /></button></div></div><div className="space-y-3 bg-slate-50 p-4 rounded-2xl border"><div className="grid grid-cols-2 gap-3"><input type="text" placeholder="PRÉNOM" value={currentItem.firstName} onChange={e => updateCurrentItem({ firstName: e.target.value.toUpperCase() })} className="p-3 bg-white border rounded-xl text-xs font-bold outline-none focus:ring-2 ring-indigo-500/20" /><input type="text" placeholder="NOM" value={currentItem.lastName} onChange={e => updateCurrentItem({ lastName: e.target.value.toUpperCase() })} className="p-3 bg-white border rounded-xl text-xs font-bold outline-none focus:ring-2 ring-indigo-500/20" /></div><input type="text" placeholder="Titre / Poste" value={currentItem.title} onChange={e => updateCurrentItem({ title: e.target.value })} className="w-full p-3 bg-white border rounded-xl text-xs font-bold outline-none focus:ring-2 ring-indigo-500/20" /></div></div><div className="flex-1 overflow-y-auto p-4 space-y-2">{state.items.map((item, idx) => ( <div key={item.id} onClick={() => updateState({ selectedIndex: idx })} className={`p-4 rounded-2xl cursor-pointer border-2 transition-all flex items-center gap-4 ${state.selectedIndex === idx ? 'bg-indigo-50 border-indigo-600 shadow-md' : 'bg-white border-slate-100 hover:border-slate-300'}`}><div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${state.selectedIndex === idx ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}> {idx + 1} </div><div className="flex-1 min-w-0"><p className="text-[11px] font-black uppercase truncate leading-none"> {item.firstName} {item.lastName} </p><p className="text-[9px] text-slate-500 uppercase truncate mt-1">{item.title || 'Sans titre'}</p></div>{invalidIds.has(item.id) && !acceptedIds.has(item.id) && <AlertTriangle size={14} className="text-red-500" />}</div> ))}</div></aside>
        <main className="flex-1 flex flex-col items-center justify-center relative p-12 bg-[#f4f7f9] shadow-inner overflow-hidden"><div className="scale-[1.8] transition-all duration-500"><NametagPreview item={currentItem} scale={1.8} onQCChange={handleQCChange} /></div><div className="absolute bottom-12 flex items-center gap-8 bg-white px-8 py-4 rounded-3xl shadow-2xl border"><button onClick={() => updateState({ selectedIndex: Math.max(0, state.selectedIndex - 1) })} disabled={state.selectedIndex === 0} className={`p-2 rounded-full transition-all ${state.selectedIndex === 0 ? 'text-slate-200' : 'hover:bg-slate-100 active:scale-90 shadow-sm'}`}><ChevronLeft size={28}/></button><span className="text-xl font-black text-slate-900 tracking-tighter">{state.selectedIndex + 1} / {state.items.length}</span><button onClick={() => updateState({ selectedIndex: Math.min(state.items.length - 1, state.selectedIndex + 1) })} disabled={state.selectedIndex === state.items.length - 1} className={`p-2 rounded-full transition-all ${state.selectedIndex === state.items.length - 1 ? 'text-slate-200' : 'hover:bg-slate-100 active:scale-90 shadow-sm'}`}><ChevronRight size={28}/></button></div></main>
        <aside className="w-[420px] bg-white border-l overflow-y-auto shrink-0 shadow-lg">
          <div className="flex border-b sticky top-0 bg-white z-20"><button onClick={() => setActiveTab('product')} className={`flex-1 flex flex-col items-center py-4 gap-1 ${activeTab === 'product' ? 'border-b-4 border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'text-slate-400'}`}> <Box size={20}/><span className="text-[9px] font-black uppercase">Produit</span> </button><button onClick={() => setActiveTab('logo')} className={`flex-1 flex flex-col items-center py-4 gap-1 ${activeTab === 'logo' ? 'border-b-4 border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'text-slate-400'}`}> <ImageIcon size={20}/><span className="text-[9px] font-black uppercase">Design</span> </button><button onClick={() => setActiveTab('style')} className={`flex-1 flex flex-col items-center py-4 gap-1 ${activeTab === 'style' ? 'border-b-4 border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'text-slate-400'}`}> <Type size={20}/><span className="text-[9px] font-black uppercase">Style</span> </button></div>
          <div className="p-6 space-y-10 animate-in pb-20">
            {activeTab === 'product' && (
              <div className="space-y-10">
                <section><label className="text-[11px] font-black uppercase block mb-6 tracking-[0.2em]">Épaisseur</label><div className="flex gap-2 p-2 bg-[#f1f5f9] rounded-[2.5rem] border-2 border-slate-100"><button onClick={() => updateState({ metalThickness: '0.020' })} className={`flex-1 py-4 rounded-[2rem] font-black text-[10px] uppercase transition-all ${state.metalThickness === '0.020' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-400'}`}> 0.020" </button><button onClick={() => updateState({ metalThickness: '0.040' })} className={`flex-1 py-4 rounded-[2rem] font-black text-[10px] uppercase transition-all ${state.metalThickness === '0.040' ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-400'}`}> 0.040" (Épais) </button></div></section>
                <section><label className="text-[11px] font-black uppercase block mb-6 tracking-[0.2em]">Forme & Coins</label><div className="flex gap-2 p-2 bg-[#f1f5f9] rounded-[2.5rem] border-2 border-slate-100"><button onClick={() => updateState({ shape: ShapeType.STANDARD })} className={`flex-1 py-4 rounded-[2rem] font-black text-[10px] uppercase transition-all ${state.shape === ShapeType.STANDARD ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-400'}`}> Standard </button><button onClick={() => updateState({ shape: ShapeType.CUSTOM })} className={`flex-1 py-4 rounded-[2rem] font-black text-[10px] uppercase transition-all ${state.shape === ShapeType.CUSTOM ? 'bg-white shadow-lg text-indigo-600' : 'text-slate-400'}`}> Sur Mesure </button></div>{state.shape === ShapeType.CUSTOM && ( <div className="mt-4 space-y-4 animate-in"><button onClick={() => shapeInputRef.current?.click()} className="w-full flex items-center justify-center gap-3 py-5 bg-indigo-50 text-indigo-600 rounded-[1.5rem] font-black text-[10px] uppercase border-2 border-dashed border-indigo-200"> <Scissors size={20} /> {state.customShape ? "Modifier Forme" : "Importer Forme"} </button><input type="file" ref={shapeInputRef} onChange={handleCustomShapeUpload} className="hidden" accept=".svg,.pdf,image/*" /></div> )}</section>
                <section><div className="flex justify-between items-center mb-6"><label className="text-[11px] font-black uppercase tracking-[0.2em]">Coins Arrondis</label><button onClick={() => updateState({ roundedCorners: !state.roundedCorners })} className={`relative w-14 h-8 rounded-full transition-all ${state.roundedCorners ? 'bg-indigo-600' : 'bg-slate-200'}`}><div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${state.roundedCorners ? 'left-7' : 'left-1'}`} /></button></div>{state.roundedCorners && ( <div className="space-y-4"><div className="flex justify-between"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rayon (0.25 in)</label></div><input type="range" min="0" max="25" value={state.cornerRadius} onChange={e => updateState({ cornerRadius: parseFloat(e.target.value) })} className="w-full h-2 bg-slate-100 rounded-lg appearance-none accent-indigo-600" /></div> )}</section>
              </div>
            )}
            {activeTab === 'logo' && (
              <div className="space-y-10">
                <section><label className="text-[11px] font-black uppercase block mb-6 tracking-[0.2em]">Logo Principal</label><label className="w-full flex flex-col items-center justify-center h-56 border-2 border-dashed rounded-[2.5rem] bg-slate-50 cursor-pointer hover:border-indigo-600 transition-all shadow-inner overflow-hidden">{state.logo ? ( <img src={state.logo} className="h-32 object-contain" alt="Logo preview" /> ) : ( <div className="flex flex-col items-center gap-4"><Upload size={24}/><span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Importer Logo</span></div> )}<input type="file" onChange={handleLogoUpload} className="hidden" accept=".svg,.pdf,image/*" /></label></section>
                <section className="space-y-8 pt-6 border-t border-slate-100">
                  <label className="text-[11px] font-black uppercase block tracking-[0.2em]">Position du Logo</label>
                  <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto">
                    <PositionButton pos="top-left" icon={<MoveUpLeft size={20}/>} />
                    <PositionButton pos="top" icon={<MoveUp size={20}/>} />
                    <PositionButton pos="top-right" icon={<MoveUpRight size={20}/>} />
                    <PositionButton pos="left" icon={<MoveLeft size={20}/>} />
                    <PositionButton pos="center" icon={<Target size={20}/>} />
                    <PositionButton pos="right" icon={<MoveRight size={20}/>} />
                    <PositionButton pos="bottom-left" icon={<MoveDownLeft size={20}/>} />
                    <PositionButton pos="bottom" icon={<MoveDown size={20}/>} />
                    <PositionButton pos="bottom-right" icon={<MoveDownRight size={20}/>} />
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center"><label className="text-[10px] font-black text-slate-400 uppercase">Taille Logo</label><span className="text-indigo-600 font-black text-[10px]">{state.logoScale}%</span></div>
                    <input type="range" min="10" max="200" value={state.logoScale} onChange={e => updateState({ logoScale: parseInt(e.target.value) })} className="w-full h-2 bg-slate-100 rounded-lg appearance-none accent-indigo-600" />
                  </div>
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase block">Offset X</label>
                      <input type="range" min="-100" max="100" value={state.logoOffsetX} onChange={e => updateState({ logoOffsetX: parseInt(e.target.value) })} className="w-full h-2 bg-slate-100 rounded-lg appearance-none accent-slate-500" />
                    </div>
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase block">Offset Y</label>
                      <input type="range" min="-100" max="100" value={state.logoOffsetY} onChange={e => updateState({ logoOffsetY: parseInt(e.target.value) })} className="w-full h-2 bg-slate-100 rounded-lg appearance-none accent-slate-500" />
                    </div>
                  </div>
                </section>
              </div>
            )}
            {activeTab === 'style' && ( <div className="space-y-6 animate-in"><div className={`rounded-[2.5rem] p-6 flex items-center gap-4 shadow-sm mx-2 transition-all duration-300 border-2 ${isIndividualMode ? 'bg-[#f1f5f9] border-slate-200 shadow-inner' : 'bg-[#fff9e6] border-[#ffcc00] shadow-md'}`}><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg bg-orange-400"> {isIndividualMode ? <SlidersHorizontal size={20} /> : <Lock size={20} />} </div><div><h4 className="text-[11px] font-black uppercase tracking-tighter"> {isIndividualMode ? 'Style Individuel' : 'Style Global'} </h4><p className="text-[8px] font-bold uppercase"> {isIndividualMode ? 'Éditez uniquement ce badge' : 'Éditez tous les badges'} </p></div><button onClick={() => setIsIndividualMode(!isIndividualMode)} className={`ml-auto relative w-14 h-8 rounded-full transition-all ${isIndividualMode ? 'bg-slate-600' : 'bg-slate-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${isIndividualMode ? 'left-7' : 'left-1'}`} /></button></div><div className="px-2 space-y-8 pb-20"><section className="space-y-4"> <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-4">Police</label> <select value={activeStyle.fontFamily} onChange={e => updateStyleSetting({ fontFamily: e.target.value })} className="w-full p-5 bg-white border-2 border-slate-100 rounded-[1.5rem] text-[12px] font-black uppercase outline-none focus:border-indigo-600 shadow-sm appearance-none transition-all"> {FONTS.map(f => <option key={f} value={f}>{f}</option>)} {customFonts.map(f => <option key={f} value={f}>Custom: {f}</option>)}</select> <button onClick={() => fontInputRef.current?.click()} className="w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase hover:bg-slate-200 transition-all border border-slate-200 shadow-sm"> <Upload size={14} className="inline mr-2" /> Importer Police </button><input type="file" ref={fontInputRef} onChange={handleFontUpload} className="hidden" accept=".ttf,.otf,.woff,.woff2" /></section><section className="space-y-6"><div className="flex items-center gap-3"> <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100"> <Type size={18} /> </div> <h3 className="text-[11px] font-black uppercase tracking-widest">Nom</h3> </div><input type="range" min="12" max="64" value={activeStyle.nameSize} onChange={e => updateStyleSetting({ nameSize: parseInt(e.target.value) })} className="w-full h-2 bg-slate-100 rounded-lg appearance-none accent-indigo-600" /><input type="color" value={activeStyle.nameColor} onChange={e => updateStyleSetting({ nameColor: e.target.value })} className="w-full h-12 bg-white border-2 rounded-2xl overflow-hidden shadow-sm hover:border-indigo-600" /></section><section className="space-y-6"><div className="flex items-center gap-3"> <div className="w-10 h-10 bg-[#1e293b] rounded-2xl flex items-center justify-center text-white shadow-lg"> <Layout size={18} /> </div> <h3 className="text-[11px] font-black uppercase tracking-widest">Poste</h3> </div><input type="range" min="8" max="48" value={activeStyle.titleSize} onChange={e => updateStyleSetting({ titleSize: parseInt(e.target.value) })} className="w-full h-2 bg-slate-100 rounded-lg appearance-none accent-slate-900" /><input type="color" value={activeStyle.titleColor} onChange={e => updateStyleSetting({ titleColor: e.target.value })} className="w-full h-12 bg-white border-2 rounded-2xl overflow-hidden shadow-sm hover:border-slate-400" /></section></div></div> )}
          </div>
        </aside>
      </div>
      <footer className="h-10 bg-slate-950 text-white flex items-center px-6 justify-between text-[9px] font-black uppercase tracking-[0.25em] z-50"><div className="flex gap-10"> <span className="flex items-center gap-2">{activeErrorsCount > 0 ? <AlertTriangle size={14} className="text-red-500 animate-pulse"/> : <CheckCircle2 size={14} className="text-emerald-400"/>}<span>{activeErrorsCount > 0 ? `${activeErrorsCount} ERREURS` : 'PRÊT'}</span></span> <span className="text-slate-400">{state.items.length} BADGES</span> </div><div className="flex items-center gap-3 text-slate-600"> <Cpu size={12} className="text-indigo-600"/> WETAG STUDIO — VECTEURS GARANTIS </div></footer>

      {showProof && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-xl flex flex-col items-center justify-center p-8 animate-in">
          <div className="w-full max-w-6xl bg-white rounded-[3rem] shadow-2xl flex flex-col overflow-hidden h-full max-h-[90vh]">
            <div className="p-8 border-b flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tighter">Planche de Production</h2>
                <p className="text-xs font-bold text-slate-400 uppercase mt-1">Vérifiez vos badges avant l'exportation finale</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-slate-200 p-1 rounded-xl">
                  <button onClick={() => setExportFormat('pdf')} className={`px-6 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${exportFormat === 'pdf' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500'}`}>PDF</button>
                  <button onClick={() => setExportFormat('svg')} className={`px-6 py-3 rounded-lg text-[10px] font-black uppercase transition-all ${exportFormat === 'svg' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500'}`}>SVG</button>
                </div>
                <button onClick={handleFinalExport} disabled={isExporting} className="flex items-center gap-3 px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50">
                  {isExporting ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
                  {isExporting ? 'Exportation...' : `Exporter en ${exportFormat.toUpperCase()}`}
                </button>
                <button onClick={() => setShowProof(false)} className="p-4 bg-white text-slate-400 rounded-2xl hover:text-slate-900 transition-all border shadow-sm"><X size={24}/></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-12 bg-[#f1f5f9]">
              <div id="bat-grid-container" className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 justify-items-center">
                {state.items.map(item => (
                  <div key={`p-${item.id}`} className="bg-white p-4 rounded-3xl shadow-lg border border-slate-200">
                    <NametagPreview item={item} isPrint={true} scale={0.8} />
                    <div className="mt-4 flex justify-between items-center px-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase">{item.id}</span>
                      {invalidIds.has(item.id) && <AlertTriangle size={14} className="text-red-500" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
