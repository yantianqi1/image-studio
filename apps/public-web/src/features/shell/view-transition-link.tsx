import Link from "next/link";
import type { ComponentProps } from "react";

type ViewTransitionLinkProps = ComponentProps<typeof Link>;

export function ViewTransitionLink(props: ViewTransitionLinkProps) {
  return <Link {...props} />;
}
