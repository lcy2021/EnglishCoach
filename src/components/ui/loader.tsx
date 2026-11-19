import { cn } from "@/lib/utils";

/** 翻书加载动画：一本摊开的书，书页依次翻过，下方三点跳动。 */
function BookLoader({ label = "正在加载", className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col items-center justify-center gap-5 py-16", className)}
    >
      <div className="book-loader" aria-hidden>
        <div className="book-loader__cover" />
        <div className="book-loader__spine" />
        <span className="book-loader__page" style={{ animationDelay: "0s" }} />
        <span className="book-loader__page" style={{ animationDelay: "0.45s" }} />
        <span className="book-loader__page" style={{ animationDelay: "0.9s" }} />
        <span className="book-loader__shadow" />
      </div>
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {label}
        <span className="typing-dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </p>
    </div>
  );
}

/** 列表卡片骨架，配合 BookLoader 或单独占位使用。 */
function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3", className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-shimmer h-[76px] rounded-2xl border bg-card" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

export { BookLoader, ListSkeleton };
