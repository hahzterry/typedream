import { HarnessProvider } from "@/components/HarnessProvider";
import { Shell } from "@/components/Shell";

export default async function ProjectLayout({ children, params }: LayoutProps<"/p/[pid]">) {
  const { pid } = await params;
  return (
    <HarnessProvider pid={pid}>
      <Shell>{children}</Shell>
    </HarnessProvider>
  );
}
