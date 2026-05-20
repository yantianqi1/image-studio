import type { ReactNode } from "react";

import { renderTopNavigation } from "./account-top-navigation";
import type { AccountLogoutController, AccountResources, AccountSession } from "./account-types";

export function renderAccountShell(props: Readonly<{
  children: ReactNode;
  logout?: AccountLogoutController;
  resources?: Pick<AccountResources, "quotaState">;
  session: AccountSession | null;
}>) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      {renderTopNavigation({ logout: props.logout, resources: props.resources, session: props.session })}
      <main className="mx-auto w-full max-w-[1440px] px-3 py-4 sm:px-8 sm:py-8 lg:px-10">{props.children}</main>
    </div>
  );
}
