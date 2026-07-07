import { cn } from "@/lib/utils";
import { FieldKind } from "@/lib/dm/types";
import {
  ListChecks, ToggleLeft, AtSign, Type, FolderTree, Repeat2,
  Hash, Calendar, Clock, Calculator, MapPin, Image as ImageIcon,
  PenLine, Brush, ScanBarcode, Mic, Video, Paperclip, Tag, Phone,
  Link as LinkIcon, HelpCircle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const STYLES: Record<string, string> = {
  select: "bg-type-select/10 text-type-select border-type-select/30",
  boolean: "bg-type-boolean/10 text-type-boolean border-type-boolean/30",
  email: "bg-type-email/10 text-type-email border-type-email/30",
  text: "bg-type-text/10 text-type-text border-type-text/30",
  group: "bg-type-group/10 text-type-group border-type-group/30",
  loop: "bg-type-loop/10 text-type-loop border-type-loop/30",
  calculation: "bg-type-calculation/10 text-type-calculation border-type-calculation/30",
  number: "bg-type-select/10 text-type-select border-type-select/30",
  date: "bg-type-email/10 text-type-email border-type-email/30",
  time: "bg-type-email/10 text-type-email border-type-email/30",
  location: "bg-type-loop/10 text-type-loop border-type-loop/30",
  image: "bg-type-group/10 text-type-group border-type-group/30",
  signature: "bg-type-group/10 text-type-group border-type-group/30",
  sketch: "bg-type-group/10 text-type-group border-type-group/30",
  barcode: "bg-type-calculation/10 text-type-calculation border-type-calculation/30",
  audio: "bg-type-loop/10 text-type-loop border-type-loop/30",
  video: "bg-type-loop/10 text-type-loop border-type-loop/30",
  file: "bg-type-text/10 text-type-text border-type-text/30",
  label: "bg-type-text/10 text-type-text border-type-text/30",
  phone: "bg-type-select/10 text-type-select border-type-select/30",
  url: "bg-type-email/10 text-type-email border-type-email/30",
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  select: ListChecks,
  boolean: ToggleLeft,
  email: AtSign,
  text: Type,
  group: FolderTree,
  loop: Repeat2,
  calculation: Calculator,
  number: Hash,
  date: Calendar,
  time: Clock,
  location: MapPin,
  image: ImageIcon,
  signature: PenLine,
  sketch: Brush,
  barcode: ScanBarcode,
  audio: Mic,
  video: Video,
  file: Paperclip,
  label: Tag,
  phone: Phone,
  url: LinkIcon,
};

const LABELS: Record<string, string> = {
  select: "Select",
  boolean: "Yes / No",
  email: "Email",
  text: "Text",
  group: "Group",
  loop: "Loop",
  calculation: "Calculation",
  number: "Number",
  date: "Date",
  time: "Time",
  location: "Location",
  image: "Image",
  signature: "Signature",
  sketch: "Sketch",
  barcode: "Barcode",
  audio: "Audio",
  video: "Video",
  file: "File",
  label: "Label",
  phone: "Phone",
  url: "URL",
};

export function TypeBadge({ kind, className }: { kind: FieldKind | string; className?: string }) {
  const Icon = ICONS[kind] || HelpCircle;
  const label = LABELS[kind] || String(kind);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-label={label}
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded border",
              STYLES[kind] || "bg-muted text-muted-foreground border-border",
              className,
            )}
          >
            <Icon className="h-3 w-3" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" sideOffset={6} collisionPadding={8} className="text-[11px]">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}