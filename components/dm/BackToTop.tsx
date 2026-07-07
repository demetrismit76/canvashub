import { useEffect, useState, RefObject } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function BackToTop({ scrollRef }: { scrollRef: RefObject<HTMLElement> }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    const onScroll = () => {
      const containerTop = el?.scrollTop ?? 0;
      const windowTop = window.scrollY || document.documentElement.scrollTop || 0;
      setShow(Math.max(containerTop, windowTop) > 300);
    };
    onScroll();
    el?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, [scrollRef]);

  const handleClick = () => {
    const el = scrollRef.current;
    if (el && el.scrollTop > 0) el.scrollTo({ top: 0, behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      onClick={handleClick}
      title="Back to top"
      aria-label="Back to top"
      className={cn(
        "absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface/95 shadow-lg backdrop-blur transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground",
        show ? "pointer-events-auto opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2",
      )}
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}