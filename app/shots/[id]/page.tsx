import { ShotDetail } from "@/components/ShotDetail";

export default async function Page({ params }: PageProps<"/shots/[id]">) {
  const { id } = await params;
  return <ShotDetail id={id} />;
}
