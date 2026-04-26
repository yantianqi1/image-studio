import { ComicJobsPage } from "@/features/jobs/comic-jobs-page";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function Page() {
  await requireAdminPage();
  return <ComicJobsPage />;
}
