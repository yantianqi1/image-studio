import { ImageJobsPage } from "@/features/jobs/image-jobs-page";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function Page() {
  await requireAdminPage();
  return <ImageJobsPage />;
}
