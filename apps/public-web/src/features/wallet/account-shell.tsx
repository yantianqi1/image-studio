import type { ReactNode } from "react";

import { renderTopNavigation } from "./account-top-navigation";
import type { AccountResources, AccountSession } from "./account-types";

export function renderAccountShell(props: Readonly<{
  children: ReactNode;
  resources?: Pick<AccountResources, "quotaState">;
  session: AccountSession | null;
}>) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,rgba(56,189,248,0.16),transparent_30%),radial-gradient(circle_at_88%_0%,rgba(124,58,237,0.13),transparent_26%),#f7f9fc] text-slate-950">
      {renderTopNavigation({ resources: props.resources, session: props.session })}
      <main className="mx-auto w-full max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10">{props.children}</main>
    </div>
  );
}
