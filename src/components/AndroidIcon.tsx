import React from 'react';
import {
  Activity,
  Aperture,
  Book,
  BookOpen,
  Calculator,
  Calendar,
  Camera,
  Car,
  CheckSquare,
  Clock,
  Code,
  Compass,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Folder,
  Globe,
  HardDrive,
  Hash,
  Headphones,
  Image,
  KeyRound,
  Landmark,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Music,
  Phone,
  Play,
  Settings,
  Shield,
  Smartphone,
  StickyNote,
} from 'lucide-react';

interface AndroidIconProps {
  iconKey: string;
  tint: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isPlaceholder?: boolean;
  className?: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  phone: Phone,
  'message-square': MessageSquare,
  globe: Globe,
  camera: Camera,
  mail: Mail,
  calendar: Calendar,
  'map-pin': MapPin,
  image: Image,
  'message-circle': MessageCircle,
  shield: Shield,
  hash: Hash,
  'hard-drive': HardDrive,
  'file-text': FileText,
  'book-open': BookOpen,
  'check-square': CheckSquare,
  code: Code,
  music: Music,
  play: Play,
  headphones: Headphones,
  book: Book,
  car: Car,
  compass: Compass,
  'credit-card': CreditCard,
  landmark: Landmark,
  'dollar-sign': DollarSign,
  settings: Settings,
  clock: Clock,
  calculator: Calculator,
  'key-round': KeyRound,
  folder: Folder,
  aperture: Aperture,
  'sticky-note': StickyNote,
  activity: Activity,
  lock: Lock,
};

const SIZE_STYLES = {
  xs: { box: 'w-4 h-4 rounded-[5px]', icon: 'w-2.5 h-2.5', badge: 'w-2.5 h-2.5' },
  sm: { box: 'w-8 h-8 rounded-[10px]', icon: 'w-4 h-4', badge: 'w-3.5 h-3.5' },
  md: { box: 'w-11 h-11 rounded-[14px]', icon: 'w-5 h-5', badge: 'w-4 h-4' },
  lg: { box: 'w-12 h-12 rounded-[15px]', icon: 'w-6 h-6', badge: 'w-4.5 h-4.5' },
};

export function AndroidIcon({
  iconKey,
  tint,
  size = 'md',
  isPlaceholder = false,
  className = '',
}: AndroidIconProps) {
  const IconComp = ICON_MAP[iconKey] ?? Smartphone;
  const dims = SIZE_STYLES[size];

  if (isPlaceholder) {
    return (
      <div
        className={`relative ${dims.box} flex items-center justify-center text-white/75 shrink-0 select-none border border-dashed border-white/70 bg-[#1F2937]/65 backdrop-blur-xs ${className}`}
        aria-hidden="true"
      >
        <IconComp className={`${dims.icon} opacity-60`} />
        {size !== 'xs' && (
          <span
            className={`absolute -bottom-1 -right-1 ${dims.badge} rounded-full bg-[#111827] border border-white/75 text-emerald-300 flex items-center justify-center shadow-sm`}
          >
            <Download className="w-2.5 h-2.5" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`${dims.box} flex items-center justify-center text-white shadow-sm shrink-0 select-none ${className}`}
      style={{
        backgroundColor: tint,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 6px rgba(0,0,0,0.22)',
      }}
      aria-hidden="true"
    >
      <IconComp className={dims.icon} />
    </div>
  );
}
