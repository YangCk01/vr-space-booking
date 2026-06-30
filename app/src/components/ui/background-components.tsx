import { cn } from "@/lib/utils";

export const Component = () => {
  return (
    <div className={cn("min-h-screen w-full relative bg-transparent")}>
      {/* Soft Yellow Glow */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `
            radial-gradient(circle at center, #FFF991 0%, transparent 70%)
          `,
          opacity: 0.6,
          mixBlendMode: "multiply",
        }}
      />
    </div>
  );
};
