import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useFormStore } from "@/store/useFormStore";
import { PushToGoCanvasDialog } from "./PushToGoCanvasDialog";

export function PushToGoCanvasButton() {
  const { adminUnlocked, pushEnabled, schema } = useFormStore();
  const [open, setOpen] = useState(false);
  if (!adminUnlocked || !pushEnabled || !schema) return null;
  return (
    <>
      <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => setOpen(true)}>
        <Upload className="mr-1 h-3.5 w-3.5" /> Push to GoCanvas
      </Button>
      <PushToGoCanvasDialog open={open} onOpenChange={setOpen} />
    </>
  );
}