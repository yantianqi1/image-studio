import { AdminGalleryPage } from "@/features/gallery/admin-gallery-page";
import { requireAdminPage } from "@/lib/admin-auth";

export default async function Page() {
  await requireAdminPage();
  return <AdminGalleryPage />;
}
