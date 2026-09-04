import { createFileRoute } from "@tanstack/react-router";
import { RamenWalker } from "@/components/ramen-walker";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <RamenWalker />;
}
