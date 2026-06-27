import * as React from "react";
import { Image as ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  type CarouselApi,
} from "@/components/ui/carousel";

/**
 * Read-only image carousel for property photos.
 *
 * - empty   -> aspect box with a centered placeholder icon
 * - 1 image -> the single image, no arrows / no dots
 * - 2+      -> embla carousel with chevron arrows + dot indicators
 */
export function PropertyImageCarousel({
  images,
  alt = "Property photo",
  aspectClassName = "aspect-[16/7]",
  className,
}: {
  images: string[];
  alt?: string;
  aspectClassName?: string;
  className?: string;
}): React.JSX.Element {
  const [api, setApi] = React.useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => {
    if (!api) return;

    const onSelect = () => setSelectedIndex(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);

    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  const wrapperClass = cn("overflow-hidden rounded-lg bg-surface", className);

  // Empty -> placeholder
  if (images.length === 0) {
    return (
      <div className={wrapperClass}>
        <div
          className={cn(
            aspectClassName,
            "flex w-full items-center justify-center text-muted-foreground",
          )}
        >
          <ImageIcon className="h-7 w-7" />
        </div>
      </div>
    );
  }

  // Single image -> no controls
  if (images.length === 1) {
    return (
      <div className={wrapperClass}>
        <div className={cn(aspectClassName, "w-full")}>
          <img
            src={images[0]}
            alt={alt}
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    );
  }

  // Multiple images -> carousel with arrows + dots
  return (
    <div className={cn("relative", wrapperClass)}>
      <Carousel setApi={setApi} opts={{ loop: true }} className="w-full">
        <CarouselContent className="ml-0">
          {images.map((src, i) => (
            <CarouselItem key={i} className="pl-0">
              <div className={cn(aspectClassName, "w-full")}>
                <img
                  src={src}
                  alt={`${alt} ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-2 top-1/2" />
        <CarouselNext className="right-2 top-1/2" />
      </Carousel>

      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Go to image ${i + 1}`}
            aria-current={i === selectedIndex}
            onClick={() => api?.scrollTo(i)}
            className={cn(
              "pointer-events-auto h-1.5 rounded-full transition-all",
              i === selectedIndex
                ? "w-4 bg-white"
                : "w-1.5 bg-white/60 hover:bg-white/80",
            )}
          />
        ))}
      </div>
    </div>
  );
}
