import Image from "next/image";

const BRAND_LOGO_SRC = "/brand/logo.png";

type BrandMarkProps = Readonly<{
  className?: string;
}>;

export function BrandMark({ className = "block h-full w-full object-contain" }: BrandMarkProps) {
  return <Image alt="" aria-hidden="true" className={className} draggable={false} height={512} src={BRAND_LOGO_SRC} width={512} />;
}
