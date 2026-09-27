import LegacyHome from "./legacy-home";
export const dynamic = "force-dynamic";
export default async function TestHome(props: { searchParams: Promise<{ template?: string }> }) {
  // The legacy Vite lane defines this flag as literal "0", so it keeps the
  // original client page without importing the Node-only authorization graph.
  if (process.env.FRAME_ZERO_ACCOUNT_NODE_RUNTIME === "1") {
    const { default: LaboratoryPage } = await import("./laboratory-page");
    return <LaboratoryPage {...props} />;
  }
  return <LegacyHome />;
}
