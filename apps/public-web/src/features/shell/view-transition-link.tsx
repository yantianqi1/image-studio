"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";

type ViewTransitionLinkProps = ComponentProps<typeof Link>;

export function ViewTransitionLink(props: ViewTransitionLinkProps) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (props.onClick) {
      props.onClick(event as never);
    }
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) {
      return;
    }
    const href = typeof props.href === "string" ? props.href : props.href.pathname ?? "/";
    if (!supportsViewTransitions()) {
      return;
    }
    event.preventDefault();
    document.startViewTransition(() => {
      router.push(href);
    });
  }

  return <Link {...props} onClick={handleClick} />;
}

function supportsViewTransitions(): boolean {
  return typeof document !== "undefined" && "startViewTransition" in document;
}
