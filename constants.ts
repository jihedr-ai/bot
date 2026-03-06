
import { 
  MaterialFamily, ShapeType, AttachmentType, 
  PlasticColor, MetalFinish, TagStyle 
} from './types';

export const PLASTIC_COLORS: PlasticColor[] = [
  // Standards & Classiques
  { name: 'Noir / Blanc', code: 'LM 922-402', bgColor: '#000000', textColor: '#ffffff' },
  { name: 'Blanc / Noir', code: 'LM 922-204', bgColor: '#ffffff', textColor: '#000000' },
  { name: 'Rouge / Blanc', code: 'LM 922-602', bgColor: '#e11d48', textColor: '#ffffff' },
  { name: 'Bleu Royal / Blanc', code: 'LM 922-502', bgColor: '#1e40af', textColor: '#ffffff' },
  { name: 'Vert Kelly / Blanc', code: 'LM 922-932', bgColor: '#15803d', textColor: '#ffffff' },
  { name: 'Jaune / Noir', code: 'LM 922-704', bgColor: '#facc15', textColor: '#000000' },
  { name: 'Orange / Blanc', code: 'LM 922-622', bgColor: '#f97316', textColor: '#ffffff' },
  { name: 'Gris / Noir', code: 'LM 922-304', bgColor: '#94a3b8', textColor: '#000000' },
  { name: 'Bourgogne / Blanc', code: 'LM 922-612', bgColor: '#800020', textColor: '#ffffff' },
  { name: 'Marine / Blanc', code: 'LM 922-512', bgColor: '#000080', textColor: '#ffffff' },
  { name: 'Bleu Patriote / Blanc', code: 'LM 922-552', bgColor: '#002868', textColor: '#ffffff' },
  { name: 'Vert Forêt / Blanc', code: 'LM 922-912', bgColor: '#064e3b', textColor: '#ffffff' },
  { name: 'Brun / Blanc', code: 'LM 922-802', bgColor: '#451a03', textColor: '#ffffff' },
  { name: 'Gris Ardoise / Blanc', code: 'LM 922-312', bgColor: '#334155', textColor: '#ffffff' },
  { name: 'Ivoire / Noir', code: 'LM 922-214', bgColor: '#fef3c7', textColor: '#000000' },
  
  // Métalliques (Plastique aspect métal)
  { name: 'Or Européen / Noir', code: 'LM 922-754', bgColor: '#cfb53b', textColor: '#000000' },
  { name: 'Argent / Noir', code: 'LM 922-334', bgColor: '#e2e8f0', textColor: '#000000' },
  { name: 'Cuivre / Noir', code: 'LM 922-854', bgColor: '#b45309', textColor: '#000000' },
  { name: 'Or Brossé / Noir', code: 'LM 942-754', bgColor: '#d97706', textColor: '#000000' },
  { name: 'Argent Brossé / Noir', code: 'LM 942-334', bgColor: '#cbd5e1', textColor: '#000000' },
  { name: 'Alu Brossé / Noir', code: 'LM 942-314', bgColor: '#94a3b8', textColor: '#000000' },
  { name: 'Bronze / Noir', code: 'LM 922-844', bgColor: '#78350f', textColor: '#000000' },
  
  // Textures Bois
  { name: 'Cerisier / Blanc', code: 'LM 922-152', bgColor: '#4a0404', textColor: '#ffffff' },
  { name: 'Kona / Blanc', code: 'LM 922-012', bgColor: '#3d2b1f', textColor: '#ffffff' },
  { name: 'Kona / Cendre', code: 'LM 922-082', bgColor: '#3d2b1f', textColor: '#c0c0c0' },
  { name: 'Cannelle / Blanc', code: 'LM 922-222', bgColor: '#d2691e', textColor: '#ffffff' },
  { name: 'Cannelle / Cendre', code: 'LM 922-022', bgColor: '#d2691e', textColor: '#c0c0c0' },
  { name: 'Cajou / Noir', code: 'LM 922-124', bgColor: '#d2b48c', textColor: '#000000' },
  { name: 'Cajou / Taupe', code: 'LM 922-120', bgColor: '#d2b48c', textColor: '#483c32' },
  { name: 'Chêne / Noir', code: 'LM 922-114', bgColor: '#a16207', textColor: '#000000' },
  { name: 'Noyer / Blanc', code: 'LM 922-132', bgColor: '#271709', textColor: '#ffffff' },
  { name: 'Pin / Noir', code: 'LM 922-144', bgColor: '#ca8a04', textColor: '#000000' },

  // Couleurs Vives & Pastel
  { name: 'Rose / Blanc', code: 'LM 922-632', bgColor: '#f472b6', textColor: '#ffffff' },
  { name: 'Violet / Blanc', code: 'LM 922-532', bgColor: '#7c3aed', textColor: '#ffffff' },
  { name: 'Bleu Ciel / Noir', code: 'LM 922-524', bgColor: '#7dd3fc', textColor: '#000000' },
  { name: 'Vert Menthe / Noir', code: 'LM 922-944', bgColor: '#6ee7b7', textColor: '#000000' },
  { name: 'Teal / Blanc', code: 'LM 922-542', bgColor: '#0d9488', textColor: '#ffffff' },
  { name: 'Rouge Pomme / Blanc', code: 'LM 922-642', bgColor: '#ef4444', textColor: '#ffffff' },
  { name: 'Jaune Or / Noir', code: 'LM 922-714', bgColor: '#fbbf24', textColor: '#000000' },
  { name: 'Gris Perle / Noir', code: 'LM 922-324', bgColor: '#f1f5f9', textColor: '#000000' },
  
  // Combinaisons Spéciales
  { name: 'Noir / Or', code: 'LM 922-407', bgColor: '#000000', textColor: '#cfb53b' },
  { name: 'Noir / Argent', code: 'LM 922-403', bgColor: '#000000', textColor: '#e2e8f0' },
  { name: 'Rouge / Or', code: 'LM 922-607', bgColor: '#e11d48', textColor: '#cfb53b' },
  { name: 'Bleu / Or', code: 'LM 922-507', bgColor: '#1e40af', textColor: '#cfb53b' },
  { name: 'Vert / Or', code: 'LM 922-907', bgColor: '#15803d', textColor: '#cfb53b' },
  { name: 'Bourgogne / Or', code: 'LM 922-617', bgColor: '#800020', textColor: '#cfb53b' },
  { name: 'Blanc / Rouge', code: 'LM 922-206', bgColor: '#ffffff', textColor: '#e11d48' },
  { name: 'Blanc / Bleu', code: 'LM 922-205', bgColor: '#ffffff', textColor: '#1e40af' },
  { name: 'Blanc / Vert', code: 'LM 922-209', bgColor: '#ffffff', textColor: '#15803d' },
  { name: 'Jaune / Rouge', code: 'LM 922-706', bgColor: '#facc15', textColor: '#e11d48' },
  { name: 'Noir / Rouge', code: 'LM 922-406', bgColor: '#000000', textColor: '#e11d48' },
  { name: 'Bleu / Blanc', code: 'LM 922-502-R', bgColor: '#2563eb', textColor: '#ffffff' },
  { name: 'Vert / Blanc', code: 'LM 922-902', bgColor: '#16a34a', textColor: '#ffffff' },
  { name: 'Gris Clair / Noir', code: 'LM 922-344', bgColor: '#cbd5e1', textColor: '#000000' },
  { name: 'Beige / Brun', code: 'LM 922-228', bgColor: '#f5f5dc', textColor: '#451a03' },
  { name: 'Or Mat / Noir', code: 'LM 922-724', bgColor: '#eab308', textColor: '#000000' },
  { name: 'Argent Mat / Noir', code: 'LM 922-324-M', bgColor: '#94a3b8', textColor: '#000000' },
  { name: 'Cuivre Mat / Noir', code: 'LM 922-824', bgColor: '#d97706', textColor: '#000000' },
  { name: 'Blanc / Or', code: 'LM 922-207', bgColor: '#ffffff', textColor: '#cfb53b' },
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
