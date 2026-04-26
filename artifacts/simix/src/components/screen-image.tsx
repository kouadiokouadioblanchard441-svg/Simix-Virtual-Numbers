export function ScreenImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="w-full min-h-[100dvh] bg-black flex items-start justify-center">
      <img
        src={src}
        alt={alt}
        className="w-full h-auto block select-none"
        draggable={false}
      />
    </div>
  );
}
