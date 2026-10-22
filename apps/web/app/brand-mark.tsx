import Image from "next/image";
/** The approved Stovia artwork. Keep all brand-mark placements tied to this asset. */
export default function BrandMark({
  className = "",
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      className={"stovia-mark " + className}
      src="/brand/stovia-logo.png"
      alt=""
      width={48}
      height={48}
      sizes="48px"
      priority={priority}
    />
  );
}
