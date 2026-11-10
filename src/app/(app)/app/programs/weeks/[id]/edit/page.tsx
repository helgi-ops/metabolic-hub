import { redirect } from "next/navigation";

// Editing now happens in place on the week page ("Breyta tíma"). Keep this
// route so old links and bookmarks still land somewhere sensible.
export default async function EditWeekPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/programs/weeks/${id}`);
}
