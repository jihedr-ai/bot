
import { 
  MaterialFamily, ShapeType, AttachmentType, 
  PlasticColor, MetalFinish, TagStyle 
} from './types';

export const PLASTIC_COLORS: PlasticColor[] = [
  { name: 'Noir / Blanc', code: 'LM 922402', bgColor: '#000000', textColor: '#ffffff' },
  { name: 'Cerisier / Blanc', code: '922152', bgColor: '#4a0404', textColor: '#ffffff' },
  { name: 'Kona / Blanc', code: 'LM 922012', bgColor: '#3d2b1f', textColor: '#ffffff' },
  { name: 'Kona / Cendre', code: 'LM 922082', bgColor: '#3d2b1f', textColor: '#c0c0c0' },
  { name: 'Cannelle / Blanc', code: 'LM 922222', bgColor: '#d2691e', textColor: '#ffffff' },
  { name: 'Cannelle / Cendre', code: 'LM 922022', bgColor: '#d2691e', textColor: '#c0c0c0' },
  { name: 'Cajou / Noir', code: 'LM 922124', bgColor: '#d2b48c', textColor: '#000000' },
  { name: 'Cajou / Taupe', code: 'LM 922120', bgColor: '#d2b48c', textColor: '#483c32' },
  { name: 'Blanc / Noir', code: 'LM 9222204', bgColor: '#ffffff', textColor: '#000000' },
  { name: 'Or Européen / Noir', code: 'LM 922754', bgColor: '#cfb53b', textColor: '#000000' },
  { name: 'Bleu Patriote / Blanc', code: 'LM 922552', bgColor: '#002868', textColor: '#ffffff' },
  { name: 'Vert Kelly / Blanc', code: 'LM 922932', bgColor: '#008000', textColor: '#ffffff' },
];

export const METAL_FINISHES: MetalFinish[] = [
  { 
    name: 'Argent Brossé', 
    gradient: 'linear-gradient(135deg, #a1a1aa 0%, #f4f4f5 25%, #71717a 50%, #e4e4e7 75%, #a1a1aa 100%)', 
    bgColor: '#d4d4d8', 
    supportsWhite: false 
  },
  { 
    name: 'Or Brossé', 
    gradient: 'linear-gradient(135deg, #a16207 0%, #fef08a 25%, #854d0e 50%, #fde047 75%, #a16207 100%)', 
    bgColor: '#eab308', 
    supportsWhite: false 
  },
  { 
    name: 'Cuivre Brossé', 
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #fdba74 25%, #431407 50%, #fb923c 75%, #7c2d12 100%)', 
    bgColor: '#c2410c', 
    supportsWhite: false 
  },
  { 
    name: 'Blanc Sublimation', 
    gradient: 'none', 
    bgColor: '#ffffff', 
    supportsWhite: true 
  },
];

export const FONTS = [
  'Inter', 'Arial', 'Helvetica', 'Times New Roman', 'Roboto', 'Montserrat', 'Georgia'
];

export const DEFAULT_STYLE: TagStyle = {
  fontFamily: 'Inter',
  nameSize: 24,
  titleSize: 14,
  nameColor: '#000000',
  titleColor: '#1e293b',
  bold: true,
  alignment: 'center',
  isMultiline: true,
};

export const PRICING = {
  METAL_BASE: 11.99,
  PLASTIC_BASE: 10.99,
  CUSTOM_SHAPE_EXTRA: 0.75,
  THICK_METAL_EXTRA: 0.50,
  MAGNET_EXTRA: 1.50,
  SAME_CONTENT_DISCOUNT: 0.10,
  DISCOUNTS: [
    { min: 3, max: 9, rate: 0.20 },
    { min: 10, max: 19, rate: 0.30 },
    { min: 20, max: 49, rate: 0.40 },
    { min: 50, max: 99, rate: 0.50 },
    { min: 100, max: 249, rate: 0.60 },
    { min: 250, max: 499, rate: 0.625 },
    { min: 500, max: Infinity, rate: 0.65 },
  ]
};
