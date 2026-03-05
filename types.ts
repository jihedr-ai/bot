
export enum MaterialFamily {
  METAL = 'Metal',
  PLASTIC = 'Plastic'
}

export enum ShapeType {
  STANDARD = 'Standard',
  CUSTOM = 'Custom'
}

export enum AttachmentType {
  MAGNET = 'Magnet',
  PIN = 'Pin'
}

export interface TagStyle {
  fontFamily: string;
  nameSize: number;
  titleSize: number;
  nameColor: string;
  titleColor: string;
  bold: boolean;
  alignment: 'left' | 'center' | 'right';
  isMultiline: boolean;
}

export interface CustomShape {
  sourceType: "svg" | "pdf" | "ai" | "raster";
  outlinePathD: string;          // Chemin SVG brut (coordonnées canoniques)
  normalizedPathD: string;       // Chemin SVG normalisé (0..1) pour objectBoundingBox
  viewBox: { minX: number; minY: number; w: number; h: number };
  originalAspect: number;
}

export interface NametagItem {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  quantity: number;
  overrides?: Partial<TagStyle>;
  typoSuggestions?: {
    [key: string]: { 
      original: string;
      suggestion: string; 
      confidence: number;
      dismissed: boolean;
    };
  };
}

export interface PlasticColor {
  name: string;
  code: string;
  bgColor: string;
  textColor: string;
}

export interface MetalFinish {
  name: string;
  gradient: string;
  bgColor: string;
  supportsWhite: boolean;
}

export interface StudioState {
  items: NametagItem[];
  selectedIndex: number;
  material: MaterialFamily;
  shape: ShapeType;
  customShape: CustomShape | null;
  attachment: AttachmentType;
  metalFinish: string;
  metalThickness: '0.020' | '0.040';
  plasticColor: string;
  roundedCorners: boolean;
  cornerRadius: number;
  logo: string | null;
  logoScale: number;
  logoPos: 'left' | 'center' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  logoGap: number;
  logoMargin: number;
  logoOffsetX: number;
  logoOffsetY: number;
  background: string | null;
  backgroundOpacity: number;
  globalStyle: TagStyle;
  isSameContent: boolean;
  dimensions: {
    width: number;
    height: number;
    unit: 'in' | 'mm';
  };
  logoColor: string;
  isLogoVectorized: boolean;
  vectorLogoXml: string | null;
}
